import { createTestClient } from './axios';

export const buildTestApi = (token) => {
  const client = createTestClient(token);
  return {
    validate: () => client.get('/test/validate').then((r) => r.data.data),
    uploadPhoto: (blob) => {
      const fd = new FormData();
      fd.append('photo', blob, 'photo.jpg');
      return client
        .post('/test/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data.data);
    },
    start: () => client.post('/test/start', {}).then((r) => r.data.data),
    submit: (answers) => client.post('/test/submit', { answers }).then((r) => r.data.data),
    autoSubmit: ({ reason, eventType, answers }) =>
      client.post('/test/auto-submit', { reason, eventType, answers }).then((r) => r.data.data),
  };
};
