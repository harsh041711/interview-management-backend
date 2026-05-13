import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { reviewApi } from '@/api/reviewApi';
import { extractError } from '@/api/axios';

export const fetchReviewByCandidate = createAsyncThunk(
  'reviews/byCandidate',
  async (candidateId, { rejectWithValue }) => {
    try { return await reviewApi.getByCandidate(candidateId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const slice = createSlice({
  name: 'reviews',
  initialState: { byCandidate: {}, status: 'idle' },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchReviewByCandidate.pending, (s) => { s.status = 'loading'; });
    b.addCase(fetchReviewByCandidate.fulfilled, (s, a) => {
      s.status = 'succeeded';
      const candidateId = a.meta.arg;
      s.byCandidate[candidateId] = a.payload; // { review, history }
    });
    b.addCase(fetchReviewByCandidate.rejected, (s) => { s.status = 'failed'; });
  },
});
export default slice.reducer;
