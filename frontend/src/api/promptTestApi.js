import { apiClient } from './axios';

export const promptTestApi = {
  // Admin (candidate-scoped)
  assign:        (candidateId, problemId) => apiClient.post(`/candidates/${candidateId}/prompt-test/assign`, { problemId }).then((r) => r.data.data),
  generate:      (candidateId, body)      => apiClient.post(`/candidates/${candidateId}/prompt-test/generate`, body).then((r) => r.data.data),
  saveGenerated: (candidateId, draft)     => apiClient.post(`/candidates/${candidateId}/prompt-test/save-generated`, { draft }).then((r) => r.data.data),
  getSubmission: (candidateId)            => apiClient.get(`/candidates/${candidateId}/prompt-test/submission`).then((r) => r.data.data),
  reevaluate:    (candidateId)            => apiClient.post(`/candidates/${candidateId}/prompt-test/reevaluate`).then((r) => r.data.data),

  // Public (token)
  fetchByToken:  (token)         => apiClient.get(`/prompt-test/${token}`).then((r) => r.data.data),
  preview:       (token, prompt) => apiClient.post(`/prompt-test/${token}/preview`, { prompt }).then((r) => r.data.data),
  submit:        (token, prompt) => apiClient.post(`/prompt-test/${token}/submit`, { prompt }).then((r) => r.data.data),
};
