import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '@/api/authApi';
import { extractError } from '@/api/axios';
import {
  getToken,
  setToken,
  clearToken,
  getStoredAdmin,
  setStoredAdmin,
} from '@/utils/tokenStorage';

const initialState = {
  token: getToken(),
  admin: getStoredAdmin(),
  status: 'idle',
  error: null,
};

export const loginThunk = createAsyncThunk('auth/login', async (payload, { rejectWithValue }) => {
  try {
    const result = await authApi.login(payload);
    setToken(result.token);
    setStoredAdmin(result.admin);
    return result;
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

export const fetchMeThunk = createAsyncThunk('auth/me', async (_arg, { rejectWithValue }) => {
  try {
    const result = await authApi.me();
    setStoredAdmin(result.admin);
    return result.admin;
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      clearToken();
      state.token = null;
      state.admin = null;
      state.status = 'idle';
      state.error = null;
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.admin = action.payload.admin;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload?.message || 'Login failed';
      })
      .addCase(fetchMeThunk.fulfilled, (state, action) => {
        state.admin = action.payload;
      })
      .addCase(fetchMeThunk.rejected, (state) => {
        // me() failure usually means token invalid; let interceptor redirect.
        state.admin = null;
      });
  },
});

export const { logout, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
