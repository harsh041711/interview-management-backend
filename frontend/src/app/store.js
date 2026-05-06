import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import candidateReducer from '@/features/candidates/candidateSlice';
import questionReducer from '@/features/questions/questionSlice';
import submissionReducer from '@/features/submissions/submissionSlice';
import testReducer from '@/features/test/testSlice';
import interviewerReducer from '@/features/interviewers/interviewerSlice';
import interviewReducer from '@/features/interviews/interviewSlice';

// Stub replaced in Phase 2D (features/interviewView/interviewViewSlice.js)
const interviewViewReducer = (state = {}, _action) => state;

export const store = configureStore({
  reducer: {
    auth: authReducer,
    candidates: candidateReducer,
    questions: questionReducer,
    submissions: submissionReducer,
    test: testReducer,
    interviewers: interviewerReducer,
    interviews: interviewReducer,
    interviewView: interviewViewReducer,
  },
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: {
        ignoredActions: ['test/uploadPhoto/pending', 'test/uploadPhoto/fulfilled'],
        ignoredPaths: ['test.photoBlob'],
      },
    }),
});
