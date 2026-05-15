import { apiClient } from './axios';

export const liveCodingTaskApi = {
  // Interviewer-side (authenticated)
  create: (interviewId, { difficulty, language }) =>
    apiClient
      .post(`/me/interviews/${interviewId}/coding-tasks`, { difficulty, language })
      .then((r) => r.data.data.task),
  list: (interviewId) =>
    apiClient
      .get(`/me/interviews/${interviewId}/coding-tasks`)
      .then((r) => r.data.data.tasks),
  cancel: (interviewId, taskId) =>
    apiClient
      .post(`/me/interviews/${interviewId}/coding-tasks/${taskId}/cancel`)
      .then((r) => r.data.data.task),

  // Public-side (no auth — token in URL)
  getPublic: (token) =>
    apiClient.get(`/coding-tasks/${token}`).then((r) => r.data.data.task),
  run: (token, code) =>
    apiClient.post(`/coding-tasks/${token}/run`, { code }).then((r) => r.data.data),
  submit: (token, code) =>
    apiClient.post(`/coding-tasks/${token}/submit`, { code }).then((r) => r.data.data),
  reportMonitoring: (token, { tabSwitches }) =>
    apiClient.patch(`/coding-tasks/${token}/monitoring`, { tabSwitches }).then((r) => r.data.data),
};
