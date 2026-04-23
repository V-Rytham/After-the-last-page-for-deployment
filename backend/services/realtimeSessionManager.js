import { SessionStore } from './sessionStore.js';
import { SESSION_STATES } from '../utils/sessionStates.js';

const normalizeId = (value) => String(value || '').trim();
const MATCH_PREF_TYPES = new Set(['text', 'voice', 'video']);

export class RealtimeSessionManager {
  constructor(io) {
    this.io = io;

    this.sessions = new SessionStore({ ttlMs: 30 * 60 * 1000 });

    this.userSockets = new Map(); // userId -> Set(socketId)
    this.socketToUser = new Map(); // socketId -> userId

    this.queue = new Map(); // queueKey -> Array<{ userId, socketId, queuedAt }>
    this.userToQueueKey = new Map(); // userId -> queueKey

    this.roomMembers = new Map(); // roomId -> Set(userId)
    this.userToRoomId = new Map(); // userId -> roomId
    this.userProfiles = new Map(); // userId -> displayName
    this.matchmakingLock = Promise.resolve();

    setInterval(() => {
      this.sessions.sweep();
    }, 60_000).unref?.();
  }

  getSession(userId) {
    return this.sessions.get(userId) || { userId: normalizeId(userId), state: SESSION_STATES.IDLE };
  }

  getPublicSession(userId) {
    const session = this.getSession(userId);
    if (!session) return null;
    const { partnerUserId, socketId, ...rest } = session;
    void partnerUserId;
    void socketId;
    return rest;
  }

  ensureSession(userId, patch = {}) {
    return this.sessions.upsert(userId, patch);
  }

  registerSocket({ userId, socketId, displayName = "Reader" }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedSocketId = normalizeId(socketId);
    if (!normalizedUserId || !normalizedSocketId) {
      return;
    }

    this.socketToUser.set(normalizedSocketId, normalizedUserId);
    this.userProfiles.set(normalizedUserId, String(displayName || "Reader").trim() || "Reader");

    const existing = this.userSockets.get(normalizedUserId) || new Set();
    existing.add(normalizedSocketId);
    this.userSockets.set(normalizedUserId, existing);
  }

  unregisterSocket({ socketId, reason = 'disconnect' }) {
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
        void this.endSession(userId, { reason });
      } else {
        this.userSockets.set(userId, sockets);
      }
    } else {
      void this.endSession(userId, { reason });
    }
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

  async joinMatchmaking({ userId, displayName = "Reader", bookId, prefType }) {
    const normalizedUserId = normalizeId(userId);
    const normalizedBookId = normalizeId(bookId);
    this.userProfiles.set(normalizedUserId, String(displayName || "Reader").trim() || "Reader");
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

    return this._withMatchmakingLock(() => {
      this.leaveMatchmaking({ userId: normalizedUserId });
      this.sessions.setState(normalizedUserId, SESSION_STATES.SEARCHING, {
        bookId: normalizedBookId,
        prefType: normalizedPrefType,
        roomId: null,
        partnerUserId: null,
      });

      const items = this.queue.get(queueKey) || [];
      items.push({ userId: normalizedUserId, socketId, queuedAt: Date.now(), bookId: normalizedBookId, prefType: normalizedPrefType });
      this.queue.set(queueKey, items);
      this.userToQueueKey.set(normalizedUserId, queueKey);

      const match = this._tryDequeueMatch(queueKey);
      if (!match) {
        return { matched: false };
      }

      const finalizedMatch = this._finalizeMatch(match);
      if (!finalizedMatch) {
        return { matched: false };
      }

      return { matched: true, roomId: finalizedMatch.roomId };
    });
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
    const staleUserIds = [];
    const items = (this.queue.get(queueKey) || []).filter((item) => {
      const liveSocket = this.io.sockets.sockets.get(item.socketId);
      if (!liveSocket) {
        staleUserIds.push(item.userId);
      }
      return Boolean(liveSocket);
    });

    staleUserIds.forEach((userId) => {
      this.userToQueueKey.delete(userId);
      this.sessions.setState(userId, SESSION_STATES.IDLE, {
        roomId: null,
        partnerUserId: null,
        prefType: null,
        bookId: null,
      });
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

    const roomId = normalizeId(a.bookId || queueKey.split('_')[0]);
    return {
      queueKey,
      roomId,
      aUserId: a.userId,
      aSocketId: a.socketId,
      bUserId: b.userId,
      bSocketId: b.socketId,
      aEntry: a,
      bEntry: b,
    };
  }

  _finalizeMatch(match) {
    const {
      roomId, queueKey, aUserId, aSocketId, bUserId, bSocketId, aEntry, bEntry,
    } = match;
    const aSocket = this.io.sockets.sockets.get(aSocketId);
    const bSocket = this.io.sockets.sockets.get(bSocketId);
    if (!aSocket || !bSocket) {
      const survivor = aSocket ? { userId: aUserId, socketId: aSocketId, entry: aEntry } : (bSocket ? { userId: bUserId, socketId: bSocketId, entry: bEntry } : null);
      const missingUserId = aSocket ? bUserId : (bSocket ? aUserId : null);

      if (missingUserId) {
        this.sessions.setState(missingUserId, SESSION_STATES.IDLE, {
          roomId: null,
          partnerUserId: null,
          prefType: null,
          bookId: null,
        });
      }

      if (survivor) {
        const liveSocket = this.io.sockets.sockets.get(survivor.socketId);
        if (liveSocket) {
          const queuedItems = this.queue.get(queueKey) || [];
          queuedItems.unshift({
            userId: survivor.userId,
            socketId: survivor.socketId,
            queuedAt: Date.now(),
            bookId: survivor.entry?.bookId || roomId,
            prefType: survivor.entry?.prefType || null,
          });
          this.queue.set(queueKey, queuedItems);
          this.userToQueueKey.set(survivor.userId, queueKey);
          this.sessions.setState(survivor.userId, SESSION_STATES.SEARCHING, {
            roomId: null,
            partnerUserId: null,
          });
          liveSocket.emit('match_requeued', {
            message: 'The other reader disconnected before the chat opened. We are finding a new match.',
          });
        } else {
          this.sessions.setState(survivor.userId, SESSION_STATES.IDLE, {
            roomId: null,
            partnerUserId: null,
            prefType: null,
            bookId: null,
          });
        }
      }
      return null;
    }

    aSocket.join(roomId);
    bSocket.join(roomId);

    this.roomMembers.set(roomId, new Set([aUserId, bUserId]));
    this.userToRoomId.set(aUserId, roomId);
    this.userToRoomId.set(bUserId, roomId);

    this.sessions.setState(aUserId, SESSION_STATES.MATCHED, { roomId, partnerUserId: bUserId });
    this.sessions.setState(bUserId, SESSION_STATES.MATCHED, { roomId, partnerUserId: aUserId });

    const aDisplayName = String(this.userProfiles.get(aUserId) || 'Reader').trim();
    const bDisplayName = String(this.userProfiles.get(bUserId) || 'Reader').trim();

    aSocket.emit('match_found', {
      roomId,
      role: 'initiator',
      message: 'You have been paired with a reader.',
      partnerUsername: bDisplayName || null,
    });
    bSocket.emit('match_found', {
      roomId,
      role: 'responder',
      message: 'You have been paired with a reader.',
      partnerUsername: aDisplayName || null,
    });
    return { roomId, aUserId, bUserId };
  }

  _withMatchmakingLock(operation) {
    const run = () => Promise.resolve().then(operation);
    const next = this.matchmakingLock.then(run, run);
    this.matchmakingLock = next.catch(() => {});
    return next;
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
        partnerSocket.emit('partner_left', {
          roomId: normalizedRoomId,
          reason,
          message: 'The other reader has left the discussion',
        });
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
