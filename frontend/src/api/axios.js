import axios from 'axios';
import { getToken, clearToken } from '@/utils/tokenStorage';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL,
  withCredentials: false,
  timeout: 30_000,
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    if (status === 401 && !url.includes('/auth/login') && !url.startsWith('/test')) {
      clearToken();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

// Public client for candidate test endpoints — uses x-test-token header.
export const createTestClient = (testToken) => {
  const instance = axios.create({ baseURL, timeout: 30_000 });
  instance.interceptors.request.use((config) => {
    config.headers = config.headers || {};
    if (testToken) config.headers['x-test-token'] = testToken;
    return config;
  });
  return instance;
};

export const extractError = (err) => {
  if (err?.response?.data) {
    const { message, details } = err.response.data;
    return { message: message || 'Request failed', details, status: err.response.status };
  }
  if (err?.message) return { message: err.message };
  return { message: 'Network error' };
};
