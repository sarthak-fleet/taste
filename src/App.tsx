import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/Layout';
import Admin from '@/pages/Admin';
import Arena from '@/pages/Arena';
import ArenaBattle from '@/pages/ArenaBattle';
import Dashboard from '@/pages/Dashboard';
import EvaluatorApply from '@/pages/EvaluatorApply';
import Landing from '@/pages/Landing';
import ReportPage from '@/pages/Report';
import StudyCreate from '@/pages/StudyCreate';
import StudyDetail from '@/pages/StudyDetail';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster theme="dark" richColors />
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/studies/new" element={<StudyCreate />} />
            <Route path="/studies/:id" element={<StudyDetail />} />
            <Route path="/studies/:id/report" element={<ReportPage />} />
            <Route path="/arena" element={<Arena />} />
            <Route path="/arena/:slug" element={<ArenaBattle />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/evaluators/apply" element={<EvaluatorApply />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
