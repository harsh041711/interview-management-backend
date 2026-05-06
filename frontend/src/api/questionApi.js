import { apiClient } from './axios';

export const questionApi = {
  list: (params) => apiClient.get('/questions', { params }).then((r) => r.data.data),
  techStacks: () => apiClient.get('/questions/tech-stacks').then((r) => r.data.data.techStacks),
  create: (payload) => apiClient.post('/questions', payload).then((r) => r.data.data),
  bulk: (questions) => apiClient.post('/questions/bulk', { questions }).then((r) => r.data.data),
  generate: (payload) => apiClient.post('/questions/generate', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.put(`/questions/${id}`, payload).then((r) => r.data.data),
  remove: (id) => apiClient.delete(`/questions/${id}`).then((r) => r.data),
};
