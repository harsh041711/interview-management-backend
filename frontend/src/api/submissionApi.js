import { apiClient } from './axios';

export const submissionApi = {
  list: (params) => apiClient.get('/submissions', { params }).then((r) => r.data.data),
  detail: (id) => apiClient.get(`/submissions/${id}`).then((r) => r.data.data),
  byCandidate: (candidateId) => apiClient.get(`/submissions/by-candidate/${candidateId}`).then((r) => r.data.data),
};
