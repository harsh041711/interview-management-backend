import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import AdminLayout from '@/layouts/AdminLayout';
import PublicLayout from '@/layouts/PublicLayout';

import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import CandidateListPage from '@/features/candidates/CandidateListPage';
import QuestionListPage from '@/features/questions/QuestionListPage';
import SubmissionListPage from '@/features/submissions/SubmissionListPage';
import SubmissionDetailPage from '@/features/submissions/SubmissionDetailPage';
import InterviewerListPage from '@/features/interviewers/InterviewerListPage';
import InterviewListPage from '@/features/interviews/InterviewListPage';
import InterviewDetailPage from '@/features/interviews/InterviewDetailPage';

import TestEntryPage from '@/features/test/TestEntryPage';
import PhotoCapturePage from '@/features/test/PhotoCapturePage';
import TestPage from '@/features/test/TestPage';
import SubmittedPage from '@/features/test/SubmittedPage';
import InterviewViewPage from '@/features/interviewView/InterviewViewPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<PublicLayout />}>
        <Route path="/test/:token" element={<TestEntryPage />} />
        <Route path="/test/:token/photo" element={<PhotoCapturePage />} />
        <Route path="/test/:token/run" element={<TestPage />} />
        <Route path="/test/:token/submitted" element={<SubmittedPage />} />
        <Route path="/interview/:token" element={<InterviewViewPage />} />
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
        <Route path="/questions" element={<QuestionListPage />} />
        <Route path="/submissions" element={<SubmissionListPage />} />
        <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/interviewers" element={<InterviewerListPage />} />
        <Route path="/interviews" element={<InterviewListPage />} />
        <Route path="/interviews/:id" element={<InterviewDetailPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
