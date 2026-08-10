import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { Summary } from './pages/Summary';
import { StockDetail } from './pages/StockDetail';
import { StockForm } from './pages/StockForm';
import { CashDetail } from './pages/CashDetail';
import { OtherProductDetail } from './pages/OtherProductDetail';
import { History } from './pages/History';
import { Debug } from './pages/Debug';

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-slate-950">
        <main
          className="max-w-md mx-auto px-4 pb-24"
          style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top, 1.5rem))' }}
        >
          <Routes>
            <Route path="/" element={<Summary />} />
            <Route path="/stocks" element={<StockDetail />} />
            <Route path="/stock/:ticker" element={<StockDetail />} />
            <Route path="/stock-form" element={<StockForm />} />
            <Route path="/cash" element={<CashDetail />} />
            <Route path="/other" element={<OtherProductDetail />} />
            <Route path="/history" element={<History />} />
            <Route path="/debug" element={<Debug />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Navigation />
      </div>
    </HashRouter>
  );
}
