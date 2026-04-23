import { getOrCreateIdentity, getStoredIdentity, saveIdentity } from './identity';

export const getStoredToken = () => '';

export const getStoredUser = () => {
  const identity = getStoredIdentity() || getOrCreateIdentity();
  if (!identity) return null;

  return {
    _id: identity.userId,
    anonymousId: identity.displayName,
    displayName: identity.displayName,
    isAnonymous: false,
  };
};

export const saveAuthSession = (payload) => {
  const nextIdentity = {
    userId: payload?.userId || payload?._id || payload?.id,
    displayName: payload?.displayName || payload?.anonymousId || payload?.username,
  };

  const saved = saveIdentity(nextIdentity) || getOrCreateIdentity();
  if (!saved) return null;

  return {
    _id: saved.userId,
    anonymousId: saved.displayName,
    displayName: saved.displayName,
    isAnonymous: false,
  };
};

export const clearAuthSession = () => {
  localStorage.removeItem('ephemeralIdentity');
};

export const updateStoredUser = (patch) => {
  const current = getStoredIdentity() || getOrCreateIdentity();
  if (!current) return null;

  const next = saveIdentity({
    userId: patch?.userId || patch?._id || current.userId,
    displayName: patch?.displayName || patch?.anonymousId || current.displayName,
  });

  if (!next) return null;

  return {
    _id: next.userId,
    anonymousId: next.displayName,
    displayName: next.displayName,
    isAnonymous: false,
  };
};
