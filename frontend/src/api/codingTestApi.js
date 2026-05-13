import { apiClient } from './axios';

export const codingTestApi = {
  loadTest: (token) => apiClient.get(`/coding-test/${token}`).then((r) => r.data.data),
  submit: (token, payload) => apiClient.post(`/coding-test/${token}/submit`, payload).then((r) => r.data.data),
};
