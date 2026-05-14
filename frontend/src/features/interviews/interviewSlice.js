import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { interviewApi } from '@/api/interviewApi';
import { extractError } from '@/api/axios';

const initialState = {
  list: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  filters: { status: '', candidateId: '', interviewerId: '', from: '', to: '' },
  selected: null,
  selectedStatus: 'idle',
  pendingReschedule: null,
  rescheduleHistory: [],
  review: null,
  reviewHistory: [],
  status: 'idle',
  error: null,
  scheduleStatus: 'idle',
};

export const fetchInterviews = createAsyncThunk(
  'interviews/list',
  async (params, { rejectWithValue }) => {
    try { return await interviewApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchInterview = createAsyncThunk(
  'interviews/detail',
  async (id, { rejectWithValue }) => {
    try { return await interviewApi.detail(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const scheduleInterview = createAsyncThunk(
  'interviews/schedule',
  async (payload, { rejectWithValue }) => {
    try { return await interviewApi.schedule(payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const updateInterview = createAsyncThunk(
  'interviews/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try { return await interviewApi.update(id, payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const cancelInterview = createAsyncThunk(
  'interviews/cancel',
  async ({ id, body }, { rejectWithValue }) => {
    try { return await interviewApi.cancel(id, body); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const completeInterview = createAsyncThunk(
  'interviews/complete',
  async ({ id, body }, { rejectWithValue }) => {
    try { return await interviewApi.complete(id, body); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const decideReschedule = createAsyncThunk(
  'interviews/decideReschedule',
  async ({ id, body }, { rejectWithValue }) => {
    try { return await interviewApi.decideReschedule(id, body); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const interviewSlice = createSlice({
  name: 'interviews',
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearSelected(state) {
      state.selected = null;
      state.pendingReschedule = null;
      state.rescheduleHistory = [];
      state.review = null;
      state.reviewHistory = [];
      state.selectedStatus = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInterviews.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchInterviews.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload.items;
        state.meta = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchInterviews.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload?.message || 'Failed to load interviews';
      })
      // Detail
      .addCase(fetchInterview.pending, (state) => { state.selectedStatus = 'loading'; })
      .addCase(fetchInterview.fulfilled, (state, action) => {
        state.selectedStatus = 'succeeded';
        state.selected = action.payload.interview;
        state.pendingReschedule = action.payload.pendingReschedule || null;
        state.rescheduleHistory = action.payload.rescheduleHistory || [];
        state.review = action.payload.review || null;
        state.reviewHistory = action.payload.reviewHistory || [];
      })
      .addCase(fetchInterview.rejected, (state, action) => {
        state.selectedStatus = 'failed';
        state.error = action.payload?.message || 'Failed to load interview';
      })
      // Schedule
      .addCase(scheduleInterview.pending, (state) => { state.scheduleStatus = 'loading'; })
      .addCase(scheduleInterview.fulfilled, (state, action) => {
        state.scheduleStatus = 'succeeded';
        if (action.payload.interview) {
          state.list = [action.payload.interview, ...state.list];
          state.meta.total += 1;
        }
      })
      .addCase(scheduleInterview.rejected, (state) => { state.scheduleStatus = 'failed'; })
      // Update
      .addCase(updateInterview.fulfilled, (state, action) => {
        const updated = action.payload.interview;
        if (updated) {
          state.list = state.list.map((x) => (x.id === updated.id ? updated : x));
          if (state.selected?.id === updated.id) state.selected = updated;
        }
      })
      // Cancel
      .addCase(cancelInterview.fulfilled, (state, action) => {
        const updated = action.payload.interview;
        if (updated) {
          state.list = state.list.map((x) => (x.id === updated.id ? updated : x));
          if (state.selected?.id === updated.id) state.selected = updated;
        }
      })
      // Complete
      .addCase(completeInterview.fulfilled, (state, action) => {
        const updated = action.payload.interview;
        if (updated) {
          state.list = state.list.map((x) => (x.id === updated.id ? updated : x));
          if (state.selected?.id === updated.id) state.selected = updated;
        }
      })
      // Reschedule decision — refetch is triggered by the page after this
      .addCase(decideReschedule.fulfilled, (state, action) => {
        const updated = action.payload.interview;
        if (updated) {
          state.list = state.list.map((x) => (x.id === updated.id ? updated : x));
          if (state.selected?.id === updated.id) state.selected = updated;
        }
        state.pendingReschedule = null;
      });
  },
});

export const { setFilters, clearSelected } = interviewSlice.actions;
export default interviewSlice.reducer;
