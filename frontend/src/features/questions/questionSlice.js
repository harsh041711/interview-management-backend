import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { questionApi } from '@/api/questionApi';
import { extractError } from '@/api/axios';

const initialState = {
  list: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  filters: { techStack: '', type: '', difficulty: '' },
  status: 'idle',
  error: null,
  createStatus: 'idle',
  generateStatus: 'idle',
  techStacks: [],
  techStacksStatus: 'idle',
};

export const fetchQuestions = createAsyncThunk(
  'questions/list',
  async (params, { rejectWithValue }) => {
    try { return await questionApi.list(params); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const fetchTechStacks = createAsyncThunk(
  'questions/techStacks',
  async (_arg, { rejectWithValue }) => {
    try { return await questionApi.techStacks(); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const createQuestion = createAsyncThunk(
  'questions/create',
  async (payload, { rejectWithValue }) => {
    try { return await questionApi.create(payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const generateQuestions = createAsyncThunk(
  'questions/generate',
  async (payload, { rejectWithValue }) => {
    try { return await questionApi.generate(payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const updateQuestion = createAsyncThunk(
  'questions/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try { return await questionApi.update(id, payload); }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

export const deleteQuestion = createAsyncThunk(
  'questions/delete',
  async (id, { rejectWithValue }) => {
    try { await questionApi.remove(id); return { id }; }
    catch (err) { return rejectWithValue(extractError(err)); }
  },
);

const questionSlice = createSlice({
  name: 'questions',
  initialState,
  reducers: {
    setFilters(state, action) { state.filters = { ...state.filters, ...action.payload }; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuestions.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchQuestions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.list = action.payload.items;
        state.meta = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchQuestions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload?.message || 'Failed to load questions';
      })
      .addCase(createQuestion.pending, (state) => { state.createStatus = 'loading'; })
      .addCase(createQuestion.fulfilled, (state, action) => {
        state.createStatus = 'succeeded';
        state.list = [action.payload.question, ...state.list];
        state.meta.total += 1;
      })
      .addCase(createQuestion.rejected, (state) => { state.createStatus = 'failed'; })
      .addCase(generateQuestions.pending, (state) => { state.generateStatus = 'loading'; })
      .addCase(generateQuestions.fulfilled, (state, action) => {
        state.generateStatus = 'succeeded';
        if (action.payload.persisted && Array.isArray(action.payload.questions)) {
          state.list = [...action.payload.questions, ...state.list];
          state.meta.total += action.payload.questions.length;
        }
      })
      .addCase(generateQuestions.rejected, (state) => { state.generateStatus = 'failed'; })
      .addCase(updateQuestion.fulfilled, (state, action) => {
        const q = action.payload.question;
        state.list = state.list.map((x) => (x._id === q._id ? q : x));
      })
      .addCase(deleteQuestion.fulfilled, (state, action) => {
        state.list = state.list.filter((q) => q._id !== action.payload.id);
      })
      .addCase(fetchTechStacks.pending, (state) => { state.techStacksStatus = 'loading'; })
      .addCase(fetchTechStacks.fulfilled, (state, action) => {
        state.techStacksStatus = 'succeeded';
        state.techStacks = action.payload || [];
      })
      .addCase(fetchTechStacks.rejected, (state) => { state.techStacksStatus = 'failed'; });
  },
});

export const { setFilters: setQuestionFilters } = questionSlice.actions;
export default questionSlice.reducer;
