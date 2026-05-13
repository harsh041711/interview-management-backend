import { apiClient } from './axios';

export const reviewEditRequestApi = {
  list: (params = {}) => apiClient.get('/review-edit-requests', { params }).then((r) => r.data.data),
  decide: (id, { decision, note }) =>
    apiClient.post(`/review-edit-requests/${id}/decide`, { decision, note }).then((r) => r.data.data),
};
