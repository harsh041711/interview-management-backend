import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import AdminLayout from '@/layouts/AdminLayout';
import PublicLayout from '@/layouts/PublicLayout';
import InterviewerLayout from '@/layouts/InterviewerLayout';

import LoginPage from '@/features/auth/LoginPage';
import ForgotPasswordPage from '@/features/forgotPassword/ForgotPasswordPage';
import SetupPasswordPage from '@/features/accountSetup/SetupPasswordPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import CandidateListPage from '@/features/candidates/CandidateListPage';
import CandidateDetailPage from '@/features/candidates/CandidateDetailPage';
import CandidateCodingTestPage from '@/features/candidates/CandidateCodingTestPage';
import QuestionListPage from '@/features/questions/QuestionListPage';
import SubmissionListPage from '@/features/submissions/SubmissionListPage';
import SubmissionDetailPage from '@/features/submissions/SubmissionDetailPage';
import InterviewerListPage from '@/features/interviewers/InterviewerListPage';
import InterviewListPage from '@/features/interviews/InterviewListPage';
import InterviewDetailPage from '@/features/interviews/InterviewDetailPage';
import JobDescriptionListPage from '@/features/jobDescriptions/JobDescriptionListPage';
import CodingProblemListPage from '@/features/codingProblems/CodingProblemListPage';

import TestEntryPage from '@/features/test/TestEntryPage';
import PhotoCapturePage from '@/features/test/PhotoCapturePage';
import TestPage from '@/features/test/TestPage';
import SubmittedPage from '@/features/test/SubmittedPage';
import InterviewViewPage from '@/features/interviewView/InterviewViewPage';
import CodingTestPage from '@/features/codingTest/CodingTestPage';
import CodingTestSuccessPage from '@/features/codingTest/CodingTestSuccessPage';

import InterviewerDashboardPage from '@/features/myInterviews/InterviewerDashboardPage';
import MyInterviewDetailPage from '@/features/myInterviews/MyInterviewDetailPage';
import ReviewEditRequestsPage from '@/features/reviewEditRequests/ReviewEditRequestsPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/account/setup/:token" element={<SetupPasswordPage />} />

      <Route element={<PublicLayout />}>
        <Route path="/test/:token" element={<TestEntryPage />} />
        <Route path="/test/:token/photo" element={<PhotoCapturePage />} />
        <Route path="/test/:token/run" element={<TestPage />} />
        <Route path="/test/:token/submitted" element={<SubmittedPage />} />
        <Route path="/interview/:token" element={<InterviewViewPage />} />
        <Route path="/coding-test/:token" element={<CodingTestPage />} />
        <Route path="/coding-test/:token/submitted" element={<CodingTestSuccessPage />} />
      </Route>

      <Route
        element={(
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        )}
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/candidates" element={<CandidateListPage />} />
        <Route path="/candidates/:id" element={<CandidateDetailPage />} />
        <Route path="/candidates/:id/coding-test" element={<CandidateCodingTestPage />} />
        <Route path="/questions" element={<QuestionListPage />} />
        <Route path="/submissions" element={<SubmissionListPage />} />
        <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/interviewers" element={<InterviewerListPage />} />
        <Route path="/interviews" element={<InterviewListPage />} />
        <Route path="/interviews/:id" element={<InterviewDetailPage />} />
        <Route path="/job-descriptions" element={<JobDescriptionListPage />} />
        <Route path="/coding-problems" element={<CodingProblemListPage />} />
        <Route path="/admin/review-edit-requests" element={<ReviewEditRequestsPage />} />
      </Route>

      <Route
        element={(
          <ProtectedRoute role="interviewer">
            <InterviewerLayout />
          </ProtectedRoute>
        )}
      >
        <Route path="/interviewer/dashboard" element={<InterviewerDashboardPage />} />
        <Route path="/interviewer/interviews/:id" element={<MyInterviewDetailPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
