import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { promptProblemApi } from '@/api/promptProblemApi';
import { extractError } from '@/api/axios';

export const fetchProblems = createAsyncThunk('promptProblems/list',
  async (params, { rejectWithValue }) => {
    try { return await promptProblemApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const createProblem = createAsyncThunk('promptProblems/create',
  async (body, { rejectWithValue }) => {
    try { return await promptProblemApi.create(body); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const updateProblem = createAsyncThunk('promptProblems/update',
  async ({ id, body }, { rejectWithValue }) => {
    try { return await promptProblemApi.update(id, body); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const deleteProblem = createAsyncThunk('promptProblems/delete',
  async (id, { rejectWithValue }) => {
    try { await promptProblemApi.remove(id); return id; }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

const slice = createSlice({
  name: 'promptProblems',
  initialState: { list: [], meta: {}, status: 'idle', error: null },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchProblems.pending, (s) => { s.status = 'loading'; });
    b.addCase(fetchProblems.fulfilled, (s, a) => {
      s.status = 'succeeded';
      s.list = a.payload.items;
      s.meta = { page: a.payload.page, limit: a.payload.limit, total: a.payload.total, totalPages: a.payload.totalPages };
    });
    b.addCase(fetchProblems.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message; });
    b.addCase(createProblem.fulfilled, (s, a) => { s.list = [a.payload.problem, ...s.list]; });
    b.addCase(updateProblem.fulfilled, (s, a) => {
      s.list = s.list.map((p) => (p.id === a.payload.problem.id ? a.payload.problem : p));
    });
    b.addCase(deleteProblem.fulfilled, (s, a) => { s.list = s.list.filter((p) => p.id !== a.payload); });
  },
});

export default slice.reducer;
