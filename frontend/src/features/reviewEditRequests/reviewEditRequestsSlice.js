import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { reviewEditRequestApi } from '@/api/reviewEditRequestApi';
import { extractError } from '@/api/axios';

export const fetchEditRequests = createAsyncThunk(
  'reviewEditRequests/list',
  async (params, { rejectWithValue }) => {
    try { return await reviewEditRequestApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const decideEditRequest = createAsyncThunk(
  'reviewEditRequests/decide',
  async ({ id, decision, note }, { rejectWithValue }) => {
    try { return await reviewEditRequestApi.decide(id, { decision, note }); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const slice = createSlice({
  name: 'reviewEditRequests',
  initialState: {
    items: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    status: 'idle',
    error: null,
    busy: false,
  },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchEditRequests.pending, (s) => { s.status = 'loading'; s.error = null; });
    b.addCase(fetchEditRequests.fulfilled, (s, a) => {
      s.status = 'succeeded';
      s.items = a.payload.items;
      s.meta = {
        page: a.payload.page, limit: a.payload.limit, total: a.payload.total, totalPages: a.payload.totalPages,
      };
    });
    b.addCase(fetchEditRequests.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed'; });
    b.addCase(decideEditRequest.pending, (s) => { s.busy = true; });
    b.addCase(decideEditRequest.fulfilled, (s, a) => {
      s.busy = false;
      const updated = a.payload.request;
      // If the updated request is no longer pending, drop it from the pending list.
      if (updated.status !== 'pending') {
        s.items = s.items.filter((it) => (it._id || it.id) !== (updated._id || updated.id));
        s.meta.total = Math.max(0, s.meta.total - 1);
      }
    });
    b.addCase(decideEditRequest.rejected, (s) => { s.busy = false; });
  },
});

export default slice.reducer;
