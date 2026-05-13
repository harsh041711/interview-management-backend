import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { myInterviewApi } from '@/api/myInterviewApi';
import { extractError } from '@/api/axios';

export const fetchMyInterviews = createAsyncThunk(
  'myInterviews/list',
  async (_arg, { rejectWithValue }) => {
    try { return await myInterviewApi.list(); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchMyInterview = createAsyncThunk(
  'myInterviews/detail',
  async (id, { rejectWithValue }) => {
    try { return await myInterviewApi.detail(id); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const submitMyReview = createAsyncThunk(
  'myInterviews/submit',
  async ({ id, ratings, comments }, { rejectWithValue }) => {
    try { return await myInterviewApi.submitReview(id, { ratings, comments }); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const editMyReview = createAsyncThunk(
  'myInterviews/edit',
  async ({ reviewId, ratings, comments }, { rejectWithValue }) => {
    try { return await myInterviewApi.editReview(reviewId, { ratings, comments }); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const requestMyReviewEdit = createAsyncThunk(
  'myInterviews/requestEdit',
  async ({ reviewId, reason }, { rejectWithValue }) => {
    try { return await myInterviewApi.requestEdit(reviewId, reason); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const initial = {
  upcoming: [],
  past: [],
  listStatus: 'idle',
  listError: null,
  detail: null,
  detailStatus: 'idle',
  detailError: null,
  busy: false,
};

const slice = createSlice({
  name: 'myInterviews',
  initialState: initial,
  reducers: {
    clearDetail(state) { state.detail = null; state.detailStatus = 'idle'; state.detailError = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyInterviews.pending, (s) => { s.listStatus = 'loading'; s.listError = null; })
      .addCase(fetchMyInterviews.fulfilled, (s, a) => {
        s.listStatus = 'succeeded';
        s.upcoming = a.payload.upcoming || [];
        s.past = a.payload.past || [];
      })
      .addCase(fetchMyInterviews.rejected, (s, a) => { s.listStatus = 'failed'; s.listError = a.payload?.message || 'Failed to load'; })
      .addCase(fetchMyInterview.pending, (s) => { s.detailStatus = 'loading'; s.detailError = null; })
      .addCase(fetchMyInterview.fulfilled, (s, a) => { s.detailStatus = 'succeeded'; s.detail = a.payload; })
      .addCase(fetchMyInterview.rejected, (s, a) => { s.detailStatus = 'failed'; s.detailError = a.payload?.message || 'Failed to load'; })
      .addCase(submitMyReview.pending, (s) => { s.busy = true; })
      .addCase(submitMyReview.fulfilled, (s, a) => {
        s.busy = false;
        if (s.detail) s.detail = { ...s.detail, review: a.payload.review, canEdit: false, pendingEditRequest: null };
      })
      .addCase(submitMyReview.rejected, (s) => { s.busy = false; })
      .addCase(editMyReview.pending, (s) => { s.busy = true; })
      .addCase(editMyReview.fulfilled, (s, a) => {
        s.busy = false;
        if (s.detail) s.detail = { ...s.detail, review: a.payload.review, canEdit: false, pendingEditRequest: null };
      })
      .addCase(editMyReview.rejected, (s) => { s.busy = false; })
      .addCase(requestMyReviewEdit.pending, (s) => { s.busy = true; })
      .addCase(requestMyReviewEdit.fulfilled, (s, a) => {
        s.busy = false;
        if (s.detail) s.detail = { ...s.detail, pendingEditRequest: a.payload.request };
      })
      .addCase(requestMyReviewEdit.rejected, (s) => { s.busy = false; });
  },
});

export const { clearDetail } = slice.actions;
export default slice.reducer;
