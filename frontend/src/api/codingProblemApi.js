import { apiClient } from './axios';

export const codingProblemApi = {
  list: (params) => apiClient.get('/coding-problems', { params }).then((r) => r.data.data),
  detail: (id) => apiClient.get(`/coding-problems/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/coding-problems', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.patch(`/coding-problems/${id}`, payload).then((r) => r.data.data),
  deactivate: (id) => apiClient.delete(`/coding-problems/${id}`).then((r) => r.data),
  aiStarterCode: ({ description, language }) =>
    apiClient.post('/coding-problems/ai/starter-code', { description, language }).then((r) => r.data.data),
  aiFullProblem: ({ topic, difficulty, languages }) =>
    apiClient.post('/coding-problems/ai/full-problem', { topic, difficulty, languages }).then((r) => r.data.data),
};
