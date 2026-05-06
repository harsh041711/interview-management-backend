import { apiClient } from './axios';

export const interviewApi = {
  list: (params) => apiClient.get('/interviews', { params }).then((r) => r.data.data),
  detail: (id) => apiClient.get(`/interviews/${id}`).then((r) => r.data.data),
  schedule: (payload) => apiClient.post('/interviews', payload).then((r) => r.data.data),
  update: (id, payload) => apiClient.put(`/interviews/${id}`, payload).then((r) => r.data.data),
  cancel: (id, body) => apiClient.post(`/interviews/${id}/cancel`, body).then((r) => r.data.data),
  complete: (id, body) => apiClient.post(`/interviews/${id}/complete`, body).then((r) => r.data.data),
  decideReschedule: (id, body) => apiClient.post(`/interviews/${id}/reschedule-decision`, body).then((r) => r.data.data),
};
