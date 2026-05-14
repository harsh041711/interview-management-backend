import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { promptTestApi } from '@/api/promptTestApi';
import { extractError } from '@/api/axios';

export const fetchTestByToken = createAsyncThunk('promptTest/fetch',
  async (token, { rejectWithValue }) => {
    try { return await promptTestApi.fetchByToken(token); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const runPreview = createAsyncThunk('promptTest/preview',
  async ({ token, prompt }, { rejectWithValue }) => {
    try { return await promptTestApi.preview(token, prompt); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const submitTest = createAsyncThunk('promptTest/submit',
  async ({ token, prompt }, { rejectWithValue }) => {
    try { return await promptTestApi.submit(token, prompt); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const fetchSubmissionForCandidate = createAsyncThunk('promptTest/getSubmission',
  async (candidateId, { rejectWithValue }) => {
    try { return await promptTestApi.getSubmission(candidateId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const assignFromLibrary = createAsyncThunk('promptTest/assign',
  async ({ candidateId, problemId }, { rejectWithValue }) => {
    try { return await promptTestApi.assign(candidateId, problemId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const generateDraft = createAsyncThunk('promptTest/generate',
  async ({ candidateId, topicOverride, difficultyOverride }, { rejectWithValue }) => {
    try { return await promptTestApi.generate(candidateId, { topicOverride, difficultyOverride }); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const saveDraftAndAssign = createAsyncThunk('promptTest/saveGenerated',
  async ({ candidateId, draft }, { rejectWithValue }) => {
    try { return await promptTestApi.saveGenerated(candidateId, draft); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

export const reevaluate = createAsyncThunk('promptTest/reevaluate',
  async (candidateId, { rejectWithValue }) => {
    try { return await promptTestApi.reevaluate(candidateId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  });

const slice = createSlice({
  name: 'promptTest',
  initialState: {
    candidateView: null, candidateStatus: 'idle',
    previewOutput: null, runsRemaining: null,
    submitStatus: 'idle',
    adminSubmission: null, adminSubmissionStatus: 'idle',
    draft: null, draftStatus: 'idle',
    error: null,
  },
  reducers: {
    clearDraft: (s) => { s.draft = null; s.draftStatus = 'idle'; },
  },
  extraReducers: (b) => {
    b.addCase(fetchTestByToken.pending, (s) => { s.candidateStatus = 'loading'; });
    b.addCase(fetchTestByToken.fulfilled, (s, a) => {
      s.candidateStatus = 'succeeded';
      s.candidateView = a.payload;
      s.runsRemaining = a.payload.previewRunsRemaining;
      s.previewOutput = a.payload.lastPreviewOutput;
    });
    b.addCase(fetchTestByToken.rejected, (s, a) => { s.candidateStatus = 'failed'; s.error = a.payload?.message; });

    b.addCase(runPreview.fulfilled, (s, a) => {
      s.previewOutput = a.payload.output;
      s.runsRemaining = a.payload.runsRemaining;
    });

    b.addCase(submitTest.pending, (s) => { s.submitStatus = 'loading'; });
    b.addCase(submitTest.fulfilled, (s) => { s.submitStatus = 'succeeded'; });
    b.addCase(submitTest.rejected, (s, a) => { s.submitStatus = 'failed'; s.error = a.payload?.message; });

    b.addCase(fetchSubmissionForCandidate.fulfilled, (s, a) => {
      s.adminSubmission = a.payload.submission;
      s.adminSubmissionStatus = 'succeeded';
    });

    b.addCase(generateDraft.pending, (s) => { s.draftStatus = 'loading'; });
    b.addCase(generateDraft.fulfilled, (s, a) => { s.draftStatus = 'succeeded'; s.draft = a.payload.draft; });
    b.addCase(generateDraft.rejected, (s, a) => { s.draftStatus = 'failed'; s.error = a.payload?.message; });
  },
});

export const { clearDraft } = slice.actions;
export default slice.reducer;
