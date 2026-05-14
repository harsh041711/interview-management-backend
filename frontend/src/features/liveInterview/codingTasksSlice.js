import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { liveCodingTaskApi } from '@/api/liveCodingTaskApi';
import { extractError } from '@/api/axios';

export const fetchCodingTasks = createAsyncThunk(
  'codingTasks/fetch',
  async (interviewId, { rejectWithValue }) => {
    try { return await liveCodingTaskApi.list(interviewId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const createCodingTask = createAsyncThunk(
  'codingTasks/create',
  async ({ interviewId, difficulty, language }, { rejectWithValue }) => {
    try { return await liveCodingTaskApi.create(interviewId, { difficulty, language }); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const cancelCodingTask = createAsyncThunk(
  'codingTasks/cancel',
  async ({ interviewId, taskId }, { rejectWithValue }) => {
    try { return await liveCodingTaskApi.cancel(interviewId, taskId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const initial = {
  list: [],
  status: 'idle',     // 'idle' | 'loading' | 'ready' | 'failed'
  busy: false,        // true during create / cancel
  error: null,
};

const upsert = (list, task) => {
  const idx = list.findIndex((t) => (t._id || t.id) === (task._id || task.id));
  if (idx === -1) return [task, ...list];
  const next = list.slice();
  next[idx] = task;
  return next;
};

const slice = createSlice({
  name: 'codingTasks',
  initialState: initial,
  reducers: {
    clearCodingTasks(state) { state.list = []; state.status = 'idle'; state.error = null; },
  },
  extraReducers: (b) => {
    b.addCase(fetchCodingTasks.pending,  (s) => { s.status = 'loading'; s.error = null; });
    b.addCase(fetchCodingTasks.fulfilled,(s, a) => { s.status = 'ready'; s.list = a.payload || []; });
    b.addCase(fetchCodingTasks.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload; });

    b.addCase(createCodingTask.pending,  (s) => { s.busy = true; s.error = null; });
    b.addCase(createCodingTask.fulfilled,(s, a) => { s.busy = false; s.list = upsert(s.list, a.payload); });
    b.addCase(createCodingTask.rejected, (s, a) => { s.busy = false; s.error = a.payload; });

    b.addCase(cancelCodingTask.pending,  (s) => { s.busy = true; });
    b.addCase(cancelCodingTask.fulfilled,(s, a) => { s.busy = false; s.list = upsert(s.list, a.payload); });
    b.addCase(cancelCodingTask.rejected, (s, a) => { s.busy = false; s.error = a.payload; });
  },
});

export const { clearCodingTasks } = slice.actions;
export default slice.reducer;
