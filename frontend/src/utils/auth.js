const TOKEN_KEY = 'token';
const USER_KEY = 'currentUser';

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

export const getStoredUser = () => {
  const rawUser = localStorage.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
};

export const saveAuthSession = (payload) => {
  const { token, ...user } = payload;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem('anonId', user.anonymousId || '');
  return user;
};

export const clearAuthSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('anonId');
};

export const updateStoredUser = (patch) => {
  const current = getStoredUser();
  if (!current) {
    return null;
  }

  const nextUser = { ...current, ...patch };
  localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  return nextUser;
};
