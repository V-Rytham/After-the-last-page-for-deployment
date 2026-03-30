import { SESSION_STATES } from '../utils/sessionStates.js';

const normalizeId = (value) => String(value || '').trim();

const TRANSITIONS = Object.freeze({
  [SESSION_STATES.IDLE]: new Set([SESSION_STATES.SEARCHING, SESSION_STATES.IDLE]),
  [SESSION_STATES.SEARCHING]: new Set([SESSION_STATES.MATCHED, SESSION_STATES.SEARCHING]),
  [SESSION_STATES.MATCHED]: new Set([SESSION_STATES.IN_CONVERSATION, SESSION_STATES.MATCHED]),
  [SESSION_STATES.IN_CONVERSATION]: new Set([SESSION_STATES.IN_CONVERSATION]),
});

const canTransition = (from, to) => {
  if (to === SESSION_STATES.IDLE) {
    return true;
  }
  if (from === to) {
    return true;
  }
  const allowed = TRANSITIONS[from];
  return Boolean(allowed && allowed.has(to));
};

export class SessionStore {
  constructor({ ttlMs = 30 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }

  get(userId) {
    const key = normalizeId(userId);
    if (!key) {
      return null;
    }
    const session = this.sessions.get(key) || null;
    if (!session) {
      return null;
    }

    if (Date.now() - session.updatedAt > this.ttlMs) {
      this.sessions.delete(key);
      return null;
    }

    return { ...session };
  }

  upsert(userId, patch = {}) {
    const key = normalizeId(userId);
    if (!key) {
      throw new Error('userId is required');
    }

    const existing = this.get(key);
    const now = Date.now();
    const next = {
      userId: key,
      state: existing?.state || SESSION_STATES.IDLE,
      bookId: existing?.bookId || null,
      prefType: existing?.prefType || null,
      roomId: existing?.roomId || null,
      partnerUserId: existing?.partnerUserId || null,
      socketId: existing?.socketId || null,
      lastHeartbeat: existing?.lastHeartbeat || now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...patch,
    };

    this.sessions.set(key, next);
    return { ...next };
  }

  setState(userId, state, extra = {}) {
    const normalized = normalizeId(state);
    if (!Object.values(SESSION_STATES).includes(normalized)) {
      throw new Error(`Invalid session state: ${state}`);
    }

    const existing = this.get(userId);
    const fromState = existing?.state || SESSION_STATES.IDLE;
    if (!canTransition(fromState, normalized)) {
      const error = new Error(`Invalid session transition: ${fromState} -> ${normalized}`);
      error.code = 'INVALID_TRANSITION';
      error.statusCode = 409;
      throw error;
    }

    return this.upsert(userId, { state: normalized, ...extra });
  }

  clear(userId) {
    const key = normalizeId(userId);
    if (!key) {
      return false;
    }
    return this.sessions.delete(key);
  }

  sweep() {
    const now = Date.now();
    let removed = 0;
    for (const [key, session] of this.sessions.entries()) {
      if (now - Number(session?.updatedAt || 0) > this.ttlMs) {
        this.sessions.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
