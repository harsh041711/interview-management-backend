import { apiClient } from './axios';

export const integrationsApi = {
  googleStatus: () =>
    apiClient.get('/integrations/google/status').then((r) => r.data.data),
  googleConnectUrl: () =>
    apiClient.get('/integrations/google/connect').then((r) => r.data.data.url),
  googleDisconnect: () =>
    apiClient.post('/integrations/google/disconnect').then((r) => r.data.data),
};
