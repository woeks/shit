const TOKEN_KEY = 'auth_token';
const USER_KEY = 'current_user';
const ROLE_KEY = 'current_user_role';

export const getToken = () => window.localStorage.getItem(TOKEN_KEY) || '';

export const setAuthSession = (token: string, user: { id: string; Role?: { code?: string } }) => {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.localStorage.setItem(ROLE_KEY, user.Role?.code || '');
};

export const clearAuthSession = () => {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(ROLE_KEY);
};

export const getStoredRole = () => window.localStorage.getItem(ROLE_KEY) || '';

export const getStoredUser = <T>() => {
  const raw = window.localStorage.getItem(USER_KEY);

  if (!raw) {
    return null as T | null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null as T | null;
  }
};

export const getStoredModules = () => {
  const user = getStoredUser<{ module_permissions?: string[] }>();
  return Array.isArray(user?.module_permissions) ? user.module_permissions : [];
};
