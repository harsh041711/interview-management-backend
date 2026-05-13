import { apiClient } from './axios';

export const myInterviewApi = {
  list: () => apiClient.get('/me/interviews').then((r) => r.data.data),
  detail: (id) => apiClient.get(`/me/interviews/${id}`).then((r) => r.data.data),
  submitReview: (id, payload) =>
    apiClient.post(`/me/interviews/${id}/review`, payload).then((r) => r.data.data),
  editReview: (reviewId, payload) =>
    apiClient.patch(`/me/reviews/${reviewId}`, payload).then((r) => r.data.data),
  requestEdit: (reviewId, reason) =>
    apiClient.post(`/me/reviews/${reviewId}/edit-request`, { reason }).then((r) => r.data.data),
};
