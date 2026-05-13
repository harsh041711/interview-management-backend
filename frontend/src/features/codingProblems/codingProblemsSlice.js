import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { codingProblemApi } from '@/api/codingProblemApi';
import { extractError } from '@/api/axios';

export const fetchProblems = createAsyncThunk('codingProblems/fetch', async (params, { rejectWithValue }) => {
  try { return await codingProblemApi.list(params); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const createProblem = createAsyncThunk('codingProblems/create', async (payload, { rejectWithValue }) => {
  try { return await codingProblemApi.create(payload); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const updateProblem = createAsyncThunk('codingProblems/update', async ({ id, payload }, { rejectWithValue }) => {
  try { return await codingProblemApi.update(id, payload); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const deactivateProblem = createAsyncThunk('codingProblems/deactivate', async (id, { rejectWithValue }) => {
  try { await codingProblemApi.deactivate(id); return id; }
  catch (err) { return rejectWithValue(extractError(err)); }
});

const slice = createSlice({
  name: 'codingProblems',
  initialState: { items: [], total: 0, page: 1, totalPages: 1, status: 'idle', error: null, busy: false },
  reducers: { clearError(s) { s.error = null; } },
  extraReducers: (b) => {
    b
      .addCase(fetchProblems.pending, (s) => { s.status = 'loading'; s.error = null; })
      .addCase(fetchProblems.fulfilled, (s, a) => {
        s.status = 'succeeded';
        s.items = a.payload.items;
        s.total = a.payload.total;
        s.page = a.payload.page;
        s.totalPages = a.payload.totalPages;
      })
      .addCase(fetchProblems.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed to load'; })
      .addCase(createProblem.pending, (s) => { s.busy = true; })
      .addCase(createProblem.fulfilled, (s) => { s.busy = false; })
      .addCase(createProblem.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message; })
      .addCase(updateProblem.pending, (s) => { s.busy = true; })
      .addCase(updateProblem.fulfilled, (s) => { s.busy = false; })
      .addCase(updateProblem.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message; })
      .addCase(deactivateProblem.fulfilled, (s, a) => {
        const item = s.items.find((x) => x.id === a.payload);
        if (item) item.isActive = false;
      });
  },
});

export const { clearError } = slice.actions;
export default slice.reducer;
