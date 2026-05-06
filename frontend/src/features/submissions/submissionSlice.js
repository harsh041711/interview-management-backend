import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { submissionApi } from '@/api/submissionApi';
import { extractError } from '@/api/axios';

const initialState = {
  list: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  selected: null,
  status: 'idle',
  detailStatus: 'idle',
  error: null,
};

export const fetchSubmissions = createAsyncThunk(
  'submissions/list',
  async (params, { rejectWithValue }) => {
    try { return await submissionApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchSubmission = createAsyncThunk(
  'submissions/detail',
  async (id, { rejectWithValue }) => {
    try { return await submissionApi.detail(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const submissionSlice = createSlice({
  name: 'submissions',
  initialState,
  reducers: {
    clearSelectedSubmission(state) { state.selected = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSubmissions.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchSubmissions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload.items;
        state.meta = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchSubmissions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload?.message || 'Failed to load submissions';
      })
      .addCase(fetchSubmission.pending, (state) => { state.detailStatus = 'loading'; })
      .addCase(fetchSubmission.fulfilled, (state, action) => {
        state.detailStatus = 'succeeded';
        state.selected = action.payload.submission;
      })
      .addCase(fetchSubmission.rejected, (state, action) => {
        state.detailStatus = 'failed';
        state.error = action.payload?.message || 'Failed to load submission';
      });
  },
});

export const { clearSelectedSubmission } = submissionSlice.actions;
export default submissionSlice.reducer;
