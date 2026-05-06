import { apiClient } from './axios';

export const interviewerApi = {
  list: (params) => apiClient.get('/interviewers', { params }).then((r) => r.data.data),
  detail: (id) => apiClient.get(`/interviewers/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/interviewers', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.put(`/interviewers/${id}`, payload).then((r) => r.data.data),
  remove: (id) => apiClient.delete(`/interviewers/${id}`).then((r) => r.data),
};
