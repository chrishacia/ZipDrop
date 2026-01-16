import type { FC } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import ZipDrop from './pages/ZipDrop';
import Analytics from './pages/Analytics';
import Wrapped from './pages/Wrapped';

const AnalyticsWrapper: FC = () => {
  const navigate = useNavigate();
  return <Analytics onBack={() => navigate('/')} />;
};

const WrappedWrapper: FC = () => {
  const navigate = useNavigate();
  const { year } = useParams<{ year?: string }>();
  return <Wrapped onBack={() => navigate('/analytics')} initialYear={year ? parseInt(year, 10) : undefined} />;
};

const App: FC = () => {
  return (
    <Routes>
      <Route path="/" element={<ZipDrop />} />
      <Route path="/ZipDrop" element={<ZipDrop />} />
      <Route path="/analytics" element={<AnalyticsWrapper />} />
      <Route path="/ZipDrop/analytics" element={<AnalyticsWrapper />} />
      <Route path="/wrapped" element={<WrappedWrapper />} />
      <Route path="/wrapped/:year" element={<WrappedWrapper />} />
      <Route path="/ZipDrop/wrapped" element={<WrappedWrapper />} />
      <Route path="/ZipDrop/wrapped/:year" element={<WrappedWrapper />} />
      {/* Catch-all redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
