import { apiClient } from './axios';

export const promptProblemApi = {
  list:   (params) => apiClient.get('/prompt-problems', { params }).then((r) => r.data.data),
  create: (body)   => apiClient.post('/prompt-problems', body).then((r) => r.data.data),
  detail: (id)     => apiClient.get(`/prompt-problems/${id}`).then((r) => r.data.data),
  update: (id, b)  => apiClient.patch(`/prompt-problems/${id}`, b).then((r) => r.data.data),
  remove: (id)     => apiClient.delete(`/prompt-problems/${id}`).then((r) => r.data.data),
};
