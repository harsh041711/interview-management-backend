import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { codingTestApi } from '@/api/codingTestApi';
import { extractError } from '@/api/axios';

export const loadCodingTest = createAsyncThunk('codingTest/load', async (token, { rejectWithValue }) => {
  try { return await codingTestApi.loadTest(token); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

export const submitCodingTest = createAsyncThunk('codingTest/submit', async ({ token, submissions, tabSwitches, autoSubmitted }, { rejectWithValue }) => {
  try { return await codingTestApi.submit(token, { submissions, tabSwitches, autoSubmitted }); }
  catch (err) { return rejectWithValue(extractError(err)); }
});

const slice = createSlice({
  name: 'codingTest',
  initialState: { data: null, status: 'idle', submitting: false, submitted: false, error: null },
  reducers: { clearState: () => ({ data: null, status: 'idle', submitting: false, submitted: false, error: null }) },
  extraReducers: (b) => {
    b
      .addCase(loadCodingTest.pending, (s) => { s.status = 'loading'; s.error = null; })
      .addCase(loadCodingTest.fulfilled, (s, a) => { s.status = 'succeeded'; s.data = a.payload; })
      .addCase(loadCodingTest.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed to load'; })
      .addCase(submitCodingTest.pending, (s) => { s.submitting = true; })
      .addCase(submitCodingTest.fulfilled, (s) => { s.submitting = false; s.submitted = true; })
      .addCase(submitCodingTest.rejected, (s, a) => { s.submitting = false; s.error = a.payload?.message || 'Submit failed'; });
  },
});

export const { clearState } = slice.actions;
export default slice.reducer;
