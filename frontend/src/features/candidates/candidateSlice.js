import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { candidateApi } from '@/api/candidateApi';
import { extractError } from '@/api/axios';

const initialState = {
  list: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  filters: { search: '', status: '', techStack: '' },
  selected: null,
  selectedSubmission: null,
  current: null,
  currentStatus: 'idle',
  stats: {},
  status: 'idle',
  error: null,
  createStatus: 'idle',
};

export const fetchCandidates = createAsyncThunk(
  'candidates/list',
  async (params, { rejectWithValue }) => {
    try { return await candidateApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchCandidateStats = createAsyncThunk(
  'candidates/stats',
  async (_arg, { rejectWithValue }) => {
    try { return await candidateApi.stats(); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchCandidate = createAsyncThunk(
  'candidates/detail',
  async (id, { rejectWithValue }) => {
    try { return await candidateApi.detail(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const createCandidate = createAsyncThunk(
  'candidates/create',
  async (payload, { rejectWithValue }) => {
    try { return await candidateApi.create(payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const regenerateCandidateToken = createAsyncThunk(
  'candidates/regenerate',
  async (id, { rejectWithValue }) => {
    try { return await candidateApi.regenerateToken(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const resendCandidateInvite = createAsyncThunk(
  'candidates/resendInvite',
  async (id, { rejectWithValue }) => {
    try { return await candidateApi.resendInvite(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const deleteCandidate = createAsyncThunk(
  'candidates/delete',
  async (id, { rejectWithValue }) => {
    try { await candidateApi.remove(id); return { id }; }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const uploadCandidateResume = createAsyncThunk(
  'candidates/uploadResume',
  async ({ id, file }, { rejectWithValue }) => {
    try { return await candidateApi.uploadResume(id, file); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const removeCandidateResume = createAsyncThunk(
  'candidates/removeResume',
  async (id, { rejectWithValue }) => {
    try { return await candidateApi.removeResume(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const selectCandidate = createAsyncThunk(
  'candidates/select',
  async (id, { rejectWithValue }) => {
    try { return await candidateApi.select(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const rejectCandidate = createAsyncThunk(
  'candidates/reject',
  async ({ id, note }, { rejectWithValue }) => {
    try { return await candidateApi.reject(id, note); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const candidateSlice = createSlice({
  name: 'candidates',
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearSelected(state) {
      state.selected = null;
      state.selectedSubmission = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCandidates.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchCandidates.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload.items;
        state.meta = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchCandidates.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload?.message || 'Failed to load candidates';
      })
      .addCase(fetchCandidateStats.fulfilled, (state, action) => { state.stats = action.payload || {}; })
      .addCase(fetchCandidate.pending, (state) => { state.currentStatus = 'loading'; state.error = null; })
      .addCase(fetchCandidate.fulfilled, (state, action) => {
        state.currentStatus = 'succeeded';
        state.current = action.payload.candidate;
        state.selected = action.payload.candidate;
        state.selectedSubmission = action.payload.submission;
      })
      .addCase(fetchCandidate.rejected, (state, action) => {
        state.currentStatus = 'failed';
        state.error = action.payload?.message || 'Failed to load';
      })
      .addCase(createCandidate.pending, (state) => { state.createStatus = 'loading'; })
      .addCase(createCandidate.fulfilled, (state, action) => {
        state.createStatus = 'succeeded';
        state.list = [action.payload.candidate, ...state.list];
        state.meta.total += 1;
      })
      .addCase(createCandidate.rejected, (state) => { state.createStatus = 'failed'; })
      .addCase(regenerateCandidateToken.fulfilled, (state, action) => {
        const c = action.payload.candidate;
        state.list = state.list.map((x) => (x.id === c.id ? c : x));
        if (state.selected?.id === c.id) state.selected = c;
      })
      .addCase(deleteCandidate.fulfilled, (state, action) => {
        state.list = state.list.filter((c) => c.id !== action.payload.id);
      })
      .addCase(uploadCandidateResume.fulfilled, (state, action) => {
        const c = action.payload.candidate;
        state.list = state.list.map((x) => (x.id === c.id ? c : x));
        if (state.selected?.id === c.id) state.selected = c;
      })
      .addCase(removeCandidateResume.fulfilled, (state, action) => {
        const c = action.payload.candidate;
        state.list = state.list.map((x) => (x.id === c.id ? c : x));
        if (state.selected?.id === c.id) state.selected = c;
      })
      .addCase(selectCandidate.fulfilled, (state, action) => {
        const c = action.payload.candidate;
        state.list = state.list.map((x) => (x.id === c.id ? c : x));
        if (state.selected?.id === c.id) state.selected = c;
      })
      .addCase(rejectCandidate.fulfilled, (state, action) => {
        const c = action.payload.candidate;
        state.list = state.list.map((x) => (x.id === c.id ? c : x));
        if (state.selected?.id === c.id) state.selected = c;
      });
  },
});

export const { setFilters, clearSelected } = candidateSlice.actions;
export default candidateSlice.reducer;
