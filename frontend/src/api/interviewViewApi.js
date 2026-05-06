import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Public client for interview view endpoints — uses x-interview-token header.
export const buildInterviewClient = (token) => {
  const instance = axios.create({ baseURL, timeout: 30_000 });
  instance.interceptors.request.use((config) => {
    config.headers = config.headers || {};
    if (token) config.headers['x-interview-token'] = token;
    return config;
  });
  return instance;
};

export const buildInterviewApi = (token) => {
  const client = buildInterviewClient(token);
  return {
    getDetails: () => client.get('/interview/details').then((r) => r.data.data),
    requestReschedule: ({ proposedAt, proposedDurationMinutes, reason }) =>
      client
        .post('/interview/reschedule', { proposedAt, proposedDurationMinutes, reason })
        .then((r) => r.data.data),
  };
};
