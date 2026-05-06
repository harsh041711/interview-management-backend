import { apiClient } from './axios';

export const candidateApi = {
  list: (params) => apiClient.get('/candidates', { params }).then((r) => r.data.data),
  stats: () => apiClient.get('/candidates/stats').then((r) => r.data.data),
  detail: (id) => apiClient.get(`/candidates/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/candidates', payload).then((r) => r.data.data),
  regenerateToken: (id) => apiClient.post(`/candidates/${id}/regenerate-token`).then((r) => r.data.data),
  resendInvite: (id) => apiClient.post(`/candidates/${id}/resend-invite`).then((r) => r.data.data),
  remove: (id) => apiClient.delete(`/candidates/${id}`).then((r) => r.data),
};
