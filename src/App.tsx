import type { FC } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ZipDrop from './pages/ZipDrop';

const App: FC = () => {
  return (
    <Routes>
      <Route path="/" element={<ZipDrop />} />
      <Route path="/ZipDrop" element={<ZipDrop />} />
      {/* Catch-all redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
