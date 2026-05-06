const KEY = 'ims.token';
const ADMIN_KEY = 'ims.admin';

export const getToken = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};

export const setToken = (token) => {
  try { localStorage.setItem(KEY, token); } catch { /* noop */ }
};

export const clearToken = () => {
  try { localStorage.removeItem(KEY); localStorage.removeItem(ADMIN_KEY); } catch { /* noop */ }
};

export const getStoredAdmin = () => {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const setStoredAdmin = (admin) => {
  try { localStorage.setItem(ADMIN_KEY, JSON.stringify(admin)); } catch { /* noop */ }
};
