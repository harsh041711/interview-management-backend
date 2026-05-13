import { apiClient } from './axios';

export const jobDescriptionApi = {
  list: (params) => apiClient.get('/job-descriptions', { params }).then((r) => r.data.data),
  detail: (id) => apiClient.get(`/job-descriptions/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/job-descriptions', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.patch(`/job-descriptions/${id}`, payload).then((r) => r.data.data),
  deactivate: (id) => apiClient.delete(`/job-descriptions/${id}`).then((r) => r.data),
  lookup: (techStack, experience) =>
    apiClient.get('/job-descriptions/lookup', { params: { techStack, experience } }).then((r) => r.data.data),
};
