import { apiClient } from './axios';

export const reviewApi = {
  getByCandidate: (candidateId) =>
    apiClient.get('/reviews', { params: { candidate: candidateId } }).then((r) => r.data.data),
  getById: (id) => apiClient.get(`/reviews/${id}`).then((r) => r.data.data),
};
