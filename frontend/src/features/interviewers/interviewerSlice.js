import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { interviewerApi } from '@/api/interviewerApi';
import { extractError } from '@/api/axios';

const initialState = {
  list: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  selected: null,
  status: 'idle',
  error: null,
  createStatus: 'idle',
  filters: { search: '', isActive: '' },
};

export const fetchInterviewers = createAsyncThunk(
  'interviewers/list',
  async (params, { rejectWithValue }) => {
    try { return await interviewerApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchInterviewer = createAsyncThunk(
  'interviewers/detail',
  async (id, { rejectWithValue }) => {
    try { return await interviewerApi.detail(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const createInterviewer = createAsyncThunk(
  'interviewers/create',
  async (payload, { rejectWithValue }) => {
    try { return await interviewerApi.create(payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const updateInterviewer = createAsyncThunk(
  'interviewers/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try { return await interviewerApi.update(id, payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const deleteInterviewer = createAsyncThunk(
  'interviewers/delete',
  async (id, { rejectWithValue }) => {
    try { await interviewerApi.remove(id); return { id }; }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const interviewerSlice = createSlice({
  name: 'interviewers',
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearSelected(state) {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInterviewers.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchInterviewers.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload.items;
        state.meta = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchInterviewers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload?.message || 'Failed to load interviewers';
      })
      .addCase(fetchInterviewer.fulfilled, (state, action) => {
        state.selected = action.payload.interviewer;
      })
      .addCase(createInterviewer.pending, (state) => { state.createStatus = 'loading'; })
      .addCase(createInterviewer.fulfilled, (state, action) => {
        state.createStatus = 'succeeded';
        state.list = [action.payload.interviewer, ...state.list];
        state.meta.total += 1;
      })
      .addCase(createInterviewer.rejected, (state) => { state.createStatus = 'failed'; })
      .addCase(updateInterviewer.fulfilled, (state, action) => {
        const updated = action.payload.interviewer;
        state.list = state.list.map((x) => (x.id === updated.id ? updated : x));
        if (state.selected?.id === updated.id) state.selected = updated;
      })
      .addCase(deleteInterviewer.fulfilled, (state, action) => {
        state.list = state.list.filter((x) => x.id !== action.payload.id);
        state.meta.total = Math.max(0, state.meta.total - 1);
      });
  },
});

export const { setFilters, clearSelected } = interviewerSlice.actions;
export default interviewerSlice.reducer;
