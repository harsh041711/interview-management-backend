import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { jobDescriptionApi } from '@/api/jobDescriptionApi';
import { extractError } from '@/api/axios';

export const fetchJds = createAsyncThunk('jds/fetch', async (params, { rejectWithValue }) => {
  try {
    return await jobDescriptionApi.list(params);
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

export const createJd = createAsyncThunk('jds/create', async (payload, { rejectWithValue }) => {
  try {
    return await jobDescriptionApi.create(payload);
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

export const updateJd = createAsyncThunk('jds/update', async ({ id, payload }, { rejectWithValue }) => {
  try {
    return await jobDescriptionApi.update(id, payload);
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

export const deactivateJd = createAsyncThunk('jds/deactivate', async (id, { rejectWithValue }) => {
  try {
    await jobDescriptionApi.deactivate(id);
    return id;
  } catch (err) {
    return rejectWithValue(extractError(err));
  }
});

const slice = createSlice({
  name: 'jds',
  initialState: {
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    status: 'idle',
    error: null,
    busy: false,
  },
  reducers: {
    clearError(state) { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJds.pending, (s) => { s.status = 'loading'; s.error = null; })
      .addCase(fetchJds.fulfilled, (s, a) => {
        s.status = 'succeeded';
        s.items = a.payload.items;
        s.total = a.payload.total;
        s.page = a.payload.page;
        s.totalPages = a.payload.totalPages;
      })
      .addCase(fetchJds.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed to load'; })
      .addCase(createJd.pending, (s) => { s.busy = true; })
      .addCase(createJd.fulfilled, (s) => { s.busy = false; })
      .addCase(createJd.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message || 'Create failed'; })
      .addCase(updateJd.pending, (s) => { s.busy = true; })
      .addCase(updateJd.fulfilled, (s) => { s.busy = false; })
      .addCase(updateJd.rejected, (s, a) => { s.busy = false; s.error = a.payload?.message || 'Update failed'; })
      .addCase(deactivateJd.fulfilled, (s, a) => {
        const item = s.items.find((x) => x.id === a.payload);
        if (item) item.isActive = false;
      });
  },
});

export const { clearError } = slice.actions;
export default slice.reducer;
