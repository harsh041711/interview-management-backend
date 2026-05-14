import { apiClient } from './axios';

export const liveInterviewApi = {
  start: (interviewId) =>
    apiClient.post(`/me/interviews/${interviewId}/live/start`).then((r) => r.data.data.session),
  getActive: (interviewId) =>
    apiClient.get(`/me/interviews/${interviewId}/live`).then((r) => r.data.data.session),
  updateQuestions: (sessionId, questionUpdates) =>
    apiClient.patch(`/me/live-sessions/${sessionId}`, { questionUpdates }).then((r) => r.data.data.session),
  end: (sessionId) =>
    apiClient.post(`/me/live-sessions/${sessionId}/end`).then((r) => r.data.data.session),
};
