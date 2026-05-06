import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { buildInterviewApi } from '@/api/interviewViewApi';
import { extractError } from '@/api/axios';

const initialState = {
  token: null,
  details: null,
  viewerRole: null,
  loadStatus: 'idle',
  loadError: null,
  submitStatus: 'idle',
  submitError: null,
};

export const fetchInterviewDetails = createAsyncThunk(
  'interviewView/fetchDetails',
  async ({ token }, { rejectWithValue }) => {
    try {
      const api = buildInterviewApi(token);
      const data = await api.getDetails();
      return { ...data, token };
    } catch (err) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const submitReschedule = createAsyncThunk(
  'interviewView/submitReschedule',
  async ({ token, proposedAt, proposedDurationMinutes, reason }, { rejectWithValue, dispatch }) => {
    try {
      const api = buildInterviewApi(token);
      const data = await api.requestReschedule({ proposedAt, proposedDurationMinutes, reason });
      // Refetch details so parent re-renders with pending banner
      dispatch(fetchInterviewDetails({ token }));
      return data;
    } catch (err) {
      return rejectWithValue(extractError(err));
    }
  },
);

const interviewViewSlice = createSlice({
  name: 'interviewView',
  initialState,
  reducers: {
    resetInterviewView() {
      return { ...initialState };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInterviewDetails.pending, (state) => {
        state.loadStatus = 'loading';
        state.loadError = null;
      })
      .addCase(fetchInterviewDetails.fulfilled, (state, action) => {
        state.loadStatus = 'succeeded';
        state.token = action.payload.token;
        state.details = action.payload;
        state.viewerRole = action.payload.viewerRole;
      })
      .addCase(fetchInterviewDetails.rejected, (state, action) => {
        state.loadStatus = 'failed';
        state.loadError = action.payload || { message: 'Failed to load interview details' };
      })
      .addCase(submitReschedule.pending, (state) => {
        state.submitStatus = 'loading';
        state.submitError = null;
      })
      .addCase(submitReschedule.fulfilled, (state) => {
        state.submitStatus = 'succeeded';
      })
      .addCase(submitReschedule.rejected, (state, action) => {
        state.submitStatus = 'failed';
        state.submitError = action.payload || { message: 'Failed to submit reschedule request' };
      });
  },
});

export const { resetInterviewView } = interviewViewSlice.actions;
export default interviewViewSlice.reducer;
