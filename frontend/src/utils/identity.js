const IDENTITY_STORAGE_KEY = 'ephemeralIdentity';

const randomSuffix = () => Math.floor(1000 + Math.random() * 9000);

const toCleanString = (value, maxLen = 120) => String(value || '').trim().slice(0, maxLen);

const generateUserId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `reader-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const generateDisplayName = () => `Reader${randomSuffix()}`;

const parseIdentity = (rawValue) => {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    const userId = toCleanString(parsed?.userId, 80);
    const displayName = toCleanString(parsed?.displayName, 60);
    if (!userId || !displayName) return null;
    return { userId, displayName };
  } catch {
    return null;
  }
};

export const getStoredIdentity = () => parseIdentity(localStorage.getItem(IDENTITY_STORAGE_KEY));

export const saveIdentity = (identity) => {
  const userId = toCleanString(identity?.userId, 80);
  const displayName = toCleanString(identity?.displayName, 60);
  if (!userId || !displayName) return null;
  const normalized = { userId, displayName };
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const getOrCreateIdentity = () => {
  const existing = getStoredIdentity();
  if (existing) return existing;

  return saveIdentity({
    userId: generateUserId(),
    displayName: generateDisplayName(),
  });
};
