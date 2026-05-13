import { apiClient } from './axios';

export const candidateApi = {
  list: (params) => apiClient.get('/candidates', { params }).then((r) => r.data.data),
  stats: () => apiClient.get('/candidates/stats').then((r) => r.data.data),
  detail: (id) => apiClient.get(`/candidates/${id}`).then((r) => r.data.data),
  create: (payload) => apiClient.post('/candidates', payload).then((r) => r.data.data),
  regenerateToken: (id) => apiClient.post(`/candidates/${id}/regenerate-token`).then((r) => r.data.data),
  resendInvite: (id) => apiClient.post(`/candidates/${id}/resend-invite`).then((r) => r.data.data),
  select: (id) => apiClient.post(`/candidates/${id}/select`).then((r) => r.data.data),
  reject: (id, note) => apiClient.post(`/candidates/${id}/reject`, { note }).then((r) => r.data.data),
  remove: (id) => apiClient.delete(`/candidates/${id}`).then((r) => r.data),
  uploadResume: (id, file) => {
    const fd = new FormData();
    fd.append('resume', file);
    return apiClient
      .post(`/candidates/${id}/resume`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data.data);
  },
  removeResume: (id) => apiClient.delete(`/candidates/${id}/resume`).then((r) => r.data.data),
  approveResume: (id) => apiClient.post(`/candidates/${id}/resume/approve`).then((r) => r.data.data),
  declineResume: (id) => apiClient.post(`/candidates/${id}/resume/decline`).then((r) => r.data.data),
  rescreen: (id) => apiClient.post(`/candidates/${id}/resume/rescreen`).then((r) => r.data.data),
  sendTest: (id) => apiClient.post(`/candidates/${id}/send-test`).then((r) => r.data.data),
  sendCodingTest: (id, payload) => apiClient.post(`/candidates/${id}/coding-test/send`, payload).then((r) => r.data.data),
  regenerateCodingTest: (id) => apiClient.post(`/candidates/${id}/coding-test/regenerate`).then((r) => r.data.data),
  resendCodingTest: (id) => apiClient.post(`/candidates/${id}/coding-test/resend`).then((r) => r.data.data),
  codingShortlist: (id) => apiClient.post(`/candidates/${id}/coding-test/shortlist`).then((r) => r.data.data),
  codingReject: (id) => apiClient.post(`/candidates/${id}/coding-test/reject`).then((r) => r.data.data),
};
