import type { FC } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ZipDrop from './pages/ZipDrop';
import Analytics from './pages/Analytics';

const AnalyticsWrapper: FC = () => {
  const navigate = useNavigate();
  return <Analytics onBack={() => navigate('/')} />;
};

const App: FC = () => {
  return (
    <Routes>
      <Route path="/" element={<ZipDrop />} />
      <Route path="/ZipDrop" element={<ZipDrop />} />
      <Route path="/analytics" element={<AnalyticsWrapper />} />
      <Route path="/ZipDrop/analytics" element={<AnalyticsWrapper />} />
      {/* Catch-all redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
