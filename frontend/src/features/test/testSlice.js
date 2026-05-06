import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { buildTestApi } from '@/api/testApi';
import { extractError } from '@/api/axios';

const initialState = {
  token: null,
  candidate: null,
  validateStatus: 'idle',
  validateError: null,

  photoUploadStatus: 'idle',
  photoUrl: null,
  photoUploadError: null,

  startStatus: 'idle',
  session: null,
  questions: [],
  startError: null,

  answers: {}, // { [questionId]: answer }
  currentIndex: 0,

  submitStatus: 'idle',
  submitResult: null,
  submitError: null,

  locked: false,
  lockedReason: null,
};

export const validateToken = createAsyncThunk(
  'test/validate',
  async ({ token }, { rejectWithValue }) => {
    try {
      const api = buildTestApi(token);
      const result = await api.validate();
      return { ...result, token };
    } catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const uploadPhoto = createAsyncThunk(
  'test/uploadPhoto',
  async ({ token, blob }, { rejectWithValue }) => {
    try {
      const api = buildTestApi(token);
      return await api.uploadPhoto(blob);
    } catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const startTest = createAsyncThunk(
  'test/start',
  async ({ token }, { rejectWithValue }) => {
    try {
      const api = buildTestApi(token);
      return await api.start();
    } catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const submitTest = createAsyncThunk(
  'test/submit',
  async ({ token, answers }, { rejectWithValue }) => {
    try {
      const api = buildTestApi(token);
      return await api.submit(answers);
    } catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const autoSubmitTest = createAsyncThunk(
  'test/autoSubmit',
  async ({ token, reason, eventType, answers }, { rejectWithValue }) => {
    try {
      const api = buildTestApi(token);
      return await api.autoSubmit({ reason, eventType, answers });
    } catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const testSlice = createSlice({
  name: 'test',
  initialState,
  reducers: {
    setAnswer(state, action) {
      const { questionId, answer } = action.payload;
      state.answers[questionId] = answer;
    },
    setCurrentIndex(state, action) {
      state.currentIndex = action.payload;
    },
    nextQuestion(state) {
      state.currentIndex = Math.min(state.currentIndex + 1, state.questions.length - 1);
    },
    prevQuestion(state) {
      state.currentIndex = Math.max(0, state.currentIndex - 1);
    },
    resetTest() {
      return { ...initialState };
    },
    lockTest(state, action) {
      state.locked = true;
      state.lockedReason = action.payload?.reason || 'Session locked';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(validateToken.pending, (state) => { state.validateStatus = 'loading'; state.validateError = null; })
      .addCase(validateToken.fulfilled, (state, action) => {
        state.validateStatus = 'succeeded';
        state.candidate = action.payload.candidate;
        state.token = action.payload.token;
        state.photoUrl = action.payload.candidate.photoUrl || null;
      })
      .addCase(validateToken.rejected, (state, action) => {
        state.validateStatus = 'failed';
        state.validateError = action.payload?.message || 'Invalid or expired link';
      })
      .addCase(uploadPhoto.pending, (state) => { state.photoUploadStatus = 'loading'; state.photoUploadError = null; })
      .addCase(uploadPhoto.fulfilled, (state, action) => {
        state.photoUploadStatus = 'succeeded';
        state.photoUrl = action.payload.photoUrl;
      })
      .addCase(uploadPhoto.rejected, (state, action) => {
        state.photoUploadStatus = 'failed';
        state.photoUploadError = action.payload?.message || 'Upload failed';
      })
      .addCase(startTest.pending, (state) => { state.startStatus = 'loading'; state.startError = null; })
      .addCase(startTest.fulfilled, (state, action) => {
        state.startStatus = 'succeeded';
        state.session = action.payload.session;
        state.questions = action.payload.questions;
        state.answers = {};
        state.currentIndex = 0;
      })
      .addCase(startTest.rejected, (state, action) => {
        state.startStatus = 'failed';
        state.startError = action.payload?.message || 'Could not start the test';
      })
      .addCase(submitTest.pending, (state) => { state.submitStatus = 'loading'; state.submitError = null; })
      .addCase(submitTest.fulfilled, (state, action) => {
        state.submitStatus = 'succeeded';
        state.submitResult = action.payload;
        state.locked = true;
      })
      .addCase(submitTest.rejected, (state, action) => {
        state.submitStatus = 'failed';
        state.submitError = action.payload?.message || 'Submit failed';
      })
      .addCase(autoSubmitTest.fulfilled, (state, action) => {
        state.submitResult = action.payload;
        state.locked = true;
        state.lockedReason = state.lockedReason || 'Test auto-submitted due to violation';
      });
  },
});

export const {
  setAnswer,
  setCurrentIndex,
  nextQuestion,
  prevQuestion,
  resetTest,
  lockTest,
} = testSlice.actions;

export default testSlice.reducer;
