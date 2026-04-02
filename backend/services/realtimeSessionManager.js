import { SessionStore } from './sessionStore.js';
import { SESSION_STATES } from '../utils/sessionStates.js';

const normalizeId = (value) => String(value || '').trim();
const MATCH_PREF_TYPES = new Set(['text', 'voice', 'video']);

const buildRoomId = () => `room_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export class RealtimeSessionManager {
  constructor(io, { disconnectGraceMs = 12_000 } = {}) {
    this.io = io;
    this.disconnectGraceMs = disconnectGraceMs;

    this.sessions = new SessionStore({ ttlMs: 30 * 60 * 1000 });

    this.userSockets = new Map(); // userId -> Set(socketId)
    this.socketToUser = new Map(); // socketId -> userId

    this.queue = new Map(); // queueKey -> Array<{ userId, socketId, queuedAt }>
    this.userToQueueKey = new Map(); // userId -> queueKey

    this.roomMembers = new Map(); // roomId -> Set(userId)
    this.userToRoomId = new Map(); // userId -> roomId

    this.pendingDisconnectTimers = new Map(); // userId -> timeout

    setInterval(() => {
      this.sessions.sweep();
    }, 60_000).unref?.();
  }

  getSession(userId) {
    return this.sessions.get(userId) || { userId: normalizeId(userId), state: SESSION_STATES.IDLE };
  }

  ensureSession(userId, patch = {}) {
    return this.sessions.upsert(userId, patch);
  }

  registerSocket({ userId, socketId }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedSocketId = normalizeId(socketId);
    if (!normalizedUserId || !normalizedSocketId) {
      return;
    }

    this.socketToUser.set(normalizedSocketId, normalizedUserId);

    const existing = this.userSockets.get(normalizedUserId) || new Set();
    existing.add(normalizedSocketId);
    this.userSockets.set(normalizedUserId, existing);

    const timer = this.pendingDisconnectTimers.get(normalizedUserId);
    if (timer) {
      clearTimeout(timer);
      this.pendingDisconnectTimers.delete(normalizedUserId);
    }
  }

  unregisterSocket({ socketId }) {
    const normalizedSocketId = normalizeId(socketId);
    const userId = this.socketToUser.get(normalizedSocketId);
    if (!userId) {
      return;
    }

    this.socketToUser.delete(normalizedSocketId);
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(normalizedSocketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        this._scheduleDisconnectCleanup(userId);
      } else {
        this.userSockets.set(userId, sockets);
      }
    } else {
      this._scheduleDisconnectCleanup(userId);
    }
  }

  _scheduleDisconnectCleanup(userId) {
    const normalizedUserId = normalizeId(userId);
    if (!normalizedUserId) {
      return;
    }

    if (this.pendingDisconnectTimers.has(normalizedUserId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.pendingDisconnectTimers.delete(normalizedUserId);
      this.endSession(normalizedUserId, { reason: 'disconnect-timeout' }).catch(() => {});
    }, this.disconnectGraceMs);

    this.pendingDisconnectTimers.set(normalizedUserId, timer);
  }

  _getPrimarySocketId(userId) {
    const sockets = this.userSockets.get(normalizeId(userId));
    if (!sockets || sockets.size === 0) {
      return null;
    }
    // Pick the most recently added socket (Set iteration order preserves insertion).
    let last = null;
    for (const socketId of sockets.values()) {
      last = socketId;
    }
    return last;
  }

  async joinMatchmaking({ userId, bookId, prefType }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedBookId = normalizeId(bookId);
    const requestedPrefType = normalizeId(prefType).toLowerCase();
    const normalizedPrefType = requestedPrefType || 'text';
    if (!normalizedUserId || !normalizedBookId) {
      const error = new Error('userId and bookId are required');
      error.statusCode = 400;
      throw error;
    }

    if (!MATCH_PREF_TYPES.has(normalizedPrefType)) {
      const error = new Error('Invalid prefType. Supported values are text, voice, or video.');
      error.statusCode = 400;
      throw error;
    }

    const socketId = this._getPrimarySocketId(normalizedUserId);
    if (!socketId) {
      const error = new Error('No active socket connection.');
      error.statusCode = 409;
      throw error;
    }

    const queueKey = `${normalizedBookId}_${normalizedPrefType}`;

    this.leaveMatchmaking({ userId: normalizedUserId });
    this.sessions.setState(normalizedUserId, SESSION_STATES.SEARCHING, {
      bookId: normalizedBookId,
      prefType: normalizedPrefType,
      roomId: null,
      partnerUserId: null,
    });

    const items = this.queue.get(queueKey) || [];
    items.push({ userId: normalizedUserId, socketId, queuedAt: Date.now() });
    this.queue.set(queueKey, items);
    this.userToQueueKey.set(normalizedUserId, queueKey);

    const match = this._tryDequeueMatch(queueKey);
    if (match) {
      await this._finalizeMatch(match);
      return { matched: true, roomId: match.roomId, partnerUserId: match.partnerUserId };
    }

    return { matched: false };
  }

  leaveMatchmaking({ userId }) {
    const normalizedUserId = normalizeId(userId);
    if (!normalizedUserId) {
      return { removed: false };
    }

    const queueKey = this.userToQueueKey.get(normalizedUserId);
    if (!queueKey) {
      const session = this.sessions.get(normalizedUserId);
      if (session?.state === SESSION_STATES.SEARCHING) {
        this.sessions.setState(normalizedUserId, SESSION_STATES.IDLE, { prefType: null, bookId: null });
      }
      return { removed: false };
    }

    const before = this.queue.get(queueKey) || [];
    const after = before.filter((item) => item.userId !== normalizedUserId);
    this.queue.set(queueKey, after);
    this.userToQueueKey.delete(normalizedUserId);

    const session = this.sessions.get(normalizedUserId);
    if (session?.state === SESSION_STATES.SEARCHING) {
      this.sessions.setState(normalizedUserId, SESSION_STATES.IDLE, { prefType: null, bookId: null });
    }

    return { removed: after.length !== before.length };
  }

  _tryDequeueMatch(queueKey) {
    const items = (this.queue.get(queueKey) || []).filter((item) => {
      const liveSocket = this.io.sockets.sockets.get(item.socketId);
      return Boolean(liveSocket);
    });

    if (items.length < 2) {
      this.queue.set(queueKey, items);
      return null;
    }

    const a = items.shift();
    let bIndex = items.findIndex((item) => item.userId !== a.userId);
    if (bIndex === -1) {
      // Only the same user is queued (multi-tab). Keep one entry.
      this.queue.set(queueKey, [a]);
      return null;
    }

    const b = items.splice(bIndex, 1)[0];
    this.queue.set(queueKey, items);
    this.userToQueueKey.delete(a.userId);
    this.userToQueueKey.delete(b.userId);

    const roomId = buildRoomId();
    return {
      roomId,
      aUserId: a.userId,
      aSocketId: a.socketId,
      bUserId: b.userId,
      bSocketId: b.socketId,
      partnerUserId: b.userId,
    };
  }

  async _finalizeMatch(match) {
    const { roomId, aUserId, aSocketId, bUserId, bSocketId } = match;
    const aSocket = this.io.sockets.sockets.get(aSocketId);
    const bSocket = this.io.sockets.sockets.get(bSocketId);
    if (!aSocket || !bSocket) {
      return;
    }

    aSocket.join(roomId);
    bSocket.join(roomId);

    this.roomMembers.set(roomId, new Set([aUserId, bUserId]));
    this.userToRoomId.set(aUserId, roomId);
    this.userToRoomId.set(bUserId, roomId);

    this.sessions.setState(aUserId, SESSION_STATES.MATCHED, { roomId, partnerUserId: bUserId });
    this.sessions.setState(bUserId, SESSION_STATES.MATCHED, { roomId, partnerUserId: aUserId });

    aSocket.emit('match_found', { roomId, role: 'caller', message: 'You have been paired with a fellow reader.' });
    bSocket.emit('match_found', { roomId, role: 'callee', message: 'You have been paired with a fellow reader.' });
  }

  enterConversation({ userId, roomId }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedRoomId = normalizeId(roomId) || this.userToRoomId.get(normalizedUserId);
    if (!normalizedUserId || !normalizedRoomId) {
      return null;
    }

    const session = this.sessions.get(normalizedUserId);
    if (!session) {
      return this.sessions.setState(normalizedUserId, SESSION_STATES.IN_CONVERSATION, { roomId: normalizedRoomId });
    }

    if (session.state === SESSION_STATES.IN_CONVERSATION) {
      return session;
    }

    return this.sessions.setState(normalizedUserId, SESSION_STATES.IN_CONVERSATION, { roomId: normalizedRoomId });
  }

  async leaveRoom({ userId, roomId, reason = 'left' }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedRoomId = normalizeId(roomId) || this.userToRoomId.get(normalizedUserId);
    if (!normalizedUserId || !normalizedRoomId) {
      return { left: false };
    }

    const members = this.roomMembers.get(normalizedRoomId);
    if (!members) {
      this.userToRoomId.delete(normalizedUserId);
      this.sessions.setState(normalizedUserId, SESSION_STATES.IDLE, { roomId: null, partnerUserId: null, prefType: null, bookId: null });
      return { left: false };
    }

    members.delete(normalizedUserId);
    this.userToRoomId.delete(normalizedUserId);
    this.sessions.setState(normalizedUserId, SESSION_STATES.IDLE, { roomId: null, partnerUserId: null, prefType: null, bookId: null });

    const partnerUserId = [...members][0] || null;
    if (partnerUserId) {
      this.sessions.setState(partnerUserId, SESSION_STATES.IDLE, { roomId: null, partnerUserId: null, prefType: null, bookId: null });
      this.userToRoomId.delete(partnerUserId);

      const partnerSocketId = this._getPrimarySocketId(partnerUserId);
      const partnerSocket = partnerSocketId ? this.io.sockets.sockets.get(partnerSocketId) : null;
      if (partnerSocket) {
        partnerSocket.emit('partner_left', { roomId: normalizedRoomId, reason });
        partnerSocket.leave(normalizedRoomId);
      }
    }

    const leaverSocketId = this._getPrimarySocketId(normalizedUserId);
    const leaverSocket = leaverSocketId ? this.io.sockets.sockets.get(leaverSocketId) : null;
    if (leaverSocket) {
      leaverSocket.leave(normalizedRoomId);
    }

    this.roomMembers.delete(normalizedRoomId);
    return { left: true };
  }

  async endSession(userId, { reason = 'ended' } = {}) {
    const normalizedUserId = normalizeId(userId);
    if (!normalizedUserId) {
      return { ended: false };
    }

    this.leaveMatchmaking({ userId: normalizedUserId });

    const roomId = this.userToRoomId.get(normalizedUserId);
    if (roomId) {
      await this.leaveRoom({ userId: normalizedUserId, roomId, reason });
    }

    this.sessions.setState(normalizedUserId, SESSION_STATES.IDLE, {
      bookId: null,
      prefType: null,
      roomId: null,
      partnerUserId: null,
    });

    return { ended: true };
  }
}
