import { apiClient } from './axios';

export const codingSubmissionApi = {
  listForCandidate: (candidateId) =>
    apiClient.get('/coding-submissions', { params: { candidateId } }).then((r) => r.data.data),
  rate: (id, payload) =>
    apiClient.post(`/coding-submissions/${id}/rate`, payload).then((r) => r.data.data),
  rerun: (id) =>
    apiClient.post(`/coding-submissions/${id}/re-run`).then((r) => r.data.data),
};
