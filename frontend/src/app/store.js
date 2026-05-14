import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/features/auth/authSlice';
import candidateReducer from '@/features/candidates/candidateSlice';
import questionReducer from '@/features/questions/questionSlice';
import submissionReducer from '@/features/submissions/submissionSlice';
import testReducer from '@/features/test/testSlice';
import interviewerReducer from '@/features/interviewers/interviewerSlice';
import interviewReducer from '@/features/interviews/interviewSlice';
import interviewViewReducer from '@/features/interviewView/interviewViewSlice';
import accountSetupReducer from '@/features/accountSetup/accountSetupSlice';
import myInterviewsReducer from '@/features/myInterviews/myInterviewsSlice';
import reviewEditRequestsReducer from '@/features/reviewEditRequests/reviewEditRequestsSlice';
import reviewsReducer from '@/features/reviews/reviewSlice';
import jdsReducer from '@/features/jobDescriptions/jobDescriptionsSlice';
import codingProblemsReducer from '@/features/codingProblems/codingProblemsSlice';
import codingTestReducer from '@/features/codingTest/codingTestSlice';
import settingsReducer from '@/features/settings/settingsSlice';
import promptProblemsReducer from '@/features/promptProblems/promptProblemSlice';
import promptTestReducer from '@/features/promptTest/promptTestSlice';
import liveInterviewReducer from '@/features/liveInterview/liveInterviewSlice';

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
    accountSetup: accountSetupReducer,
    myInterviews: myInterviewsReducer,
    reviewEditRequests: reviewEditRequestsReducer,
    reviews: reviewsReducer,
    jds: jdsReducer,
    codingProblems: codingProblemsReducer,
    codingTest: codingTestReducer,
    settings: settingsReducer,
    promptProblems: promptProblemsReducer,
    promptTest: promptTestReducer,
    liveInterview: liveInterviewReducer,
  },
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: {
        ignoredActions: ['test/uploadPhoto/pending', 'test/uploadPhoto/fulfilled'],
        ignoredPaths: ['test.photoBlob'],
      },
    }),
});
