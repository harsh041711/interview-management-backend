import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { integrationsApi } from '@/api/integrationsApi';
import { extractError } from '@/api/axios';

export const fetchGoogleStatus = createAsyncThunk(
  'settings/fetchGoogleStatus',
  async (_, { rejectWithValue }) => {
    try { return await integrationsApi.googleStatus(); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const disconnectGoogle = createAsyncThunk(
  'settings/disconnectGoogle',
  async (_, { rejectWithValue }) => {
    try { return await integrationsApi.googleDisconnect(); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const slice = createSlice({
  name: 'settings',
  initialState: {
    google: {
      configured: false,
      connected: false,
      accountEmail: null,
      connectedAt: null,
    },
    googleLoading: false,
    googleError: null,
  },
  reducers: {
    clearGoogleError(state) { state.googleError = null; },
  },
  extraReducers: (b) => {
    b
      .addCase(fetchGoogleStatus.pending, (s) => { s.googleLoading = true; s.googleError = null; })
      .addCase(fetchGoogleStatus.fulfilled, (s, a) => {
        s.googleLoading = false;
        s.google = { ...s.google, ...a.payload };
      })
      .addCase(fetchGoogleStatus.rejected, (s, a) => {
        s.googleLoading = false;
        s.googleError = a.payload?.message || 'Failed to load Google status';
      })
      .addCase(disconnectGoogle.fulfilled, (s) => {
        s.google = { ...s.google, connected: false, accountEmail: null, connectedAt: null };
      });
  },
});

export const { clearGoogleError } = slice.actions;
export default slice.reducer;
