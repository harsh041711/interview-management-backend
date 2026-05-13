import { apiClient } from './axios';

export const accountApi = {
  validateToken: (token) => apiClient.get(`/account/setup/${token}`).then((r) => r.data.data),
  setup: ({ token, password }) =>
    apiClient.post('/account/setup', { token, password }).then((r) => r.data.data),
};
