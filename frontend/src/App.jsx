import AppRoutes from '@/routes/AppRoutes';
import { ToastProvider } from '@/components/common/Toast';

export default function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}
