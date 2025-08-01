import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ZipDrop from './pages/ZipDrop';

const App: React.FC = () => {
  return (
    <div className="container mt-4">
      <Routes>
        <Route path="/" element={<ZipDrop />} />
      </Routes>
    </div>
  );
};

export default App;
