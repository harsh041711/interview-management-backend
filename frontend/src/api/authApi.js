import { apiClient } from './axios';

export const authApi = {
  login: (payload) => apiClient.post('/auth/login', payload).then((r) => r.data.data),
  register: (payload) => apiClient.post('/auth/register', payload).then((r) => r.data.data),
  me: () => apiClient.get('/auth/me').then((r) => r.data.data),
  forgotPassword: (email) => apiClient.post('/auth/forgot-password', { email }).then((r) => r.data.data),
};
