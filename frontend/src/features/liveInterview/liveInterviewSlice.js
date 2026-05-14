import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { liveInterviewApi } from '@/api/liveInterviewApi';
import { extractError } from '@/api/axios';

export const startLiveSession = createAsyncThunk(
  'liveInterview/start',
  async (interviewId, { rejectWithValue }) => {
    try { return await liveInterviewApi.start(interviewId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchActiveLiveSession = createAsyncThunk(
  'liveInterview/getActive',
  async (interviewId, { rejectWithValue }) => {
    try { return await liveInterviewApi.getActive(interviewId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const patchLiveSession = createAsyncThunk(
  'liveInterview/patch',
  async ({ sessionId, questionUpdates }, { rejectWithValue }) => {
    try { return await liveInterviewApi.updateQuestions(sessionId, questionUpdates); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const endLiveSession = createAsyncThunk(
  'liveInterview/end',
  async (sessionId, { rejectWithValue }) => {
    try { return await liveInterviewApi.end(sessionId); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const initial = {
  session: null,
  status: 'idle',         // 'idle' | 'loading' | 'ready' | 'ending' | 'ended' | 'failed'
  error: null,
};

const slice = createSlice({
  name: 'liveInterview',
  initialState: initial,
  reducers: {
    clearSession(state) { state.session = null; state.status = 'idle'; state.error = null; },
    // Optimistic local update; backend reconciles on the next debounced PATCH.
    setQuestionField(state, action) {
      const { index, field, value } = action.payload;
      if (!state.session?.questions?.[index]) return;
      state.session.questions[index][field] = value;
    },
  },
  extraReducers: (b) => {
    b.addCase(startLiveSession.pending, (s) => { s.status = 'loading'; s.error = null; });
    b.addCase(startLiveSession.fulfilled, (s, a) => { s.session = a.payload; s.status = 'ready'; });
    b.addCase(startLiveSession.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed'; });

    b.addCase(fetchActiveLiveSession.pending, (s) => { s.status = 'loading'; });
    b.addCase(fetchActiveLiveSession.fulfilled, (s, a) => { s.session = a.payload; s.status = a.payload ? 'ready' : 'idle'; });
    b.addCase(fetchActiveLiveSession.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed'; });

    b.addCase(patchLiveSession.fulfilled, (s, a) => { if (a.payload) s.session = a.payload; });

    b.addCase(endLiveSession.pending, (s) => { s.status = 'ending'; });
    b.addCase(endLiveSession.fulfilled, (s, a) => { s.session = a.payload; s.status = 'ended'; });
    b.addCase(endLiveSession.rejected, (s, a) => { s.status = 'failed'; s.error = a.payload?.message || 'Failed'; });
  },
});

export const { clearSession, setQuestionField } = slice.actions;
export default slice.reducer;
