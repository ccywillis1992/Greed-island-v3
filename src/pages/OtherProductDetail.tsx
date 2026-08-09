import React from 'react';
import { Card } from '../components/Card';
import { Layers } from 'lucide-react';

export const OtherProductDetail: React.FC = () => {
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2 pb-2 border-b border-slate-800">
        <Layers className="w-5 h-5 text-emerald-400" />
        <h1 className="text-xl font-bold text-slate-100">Other Products</h1>
      </header>

      <Card>
        <p className="text-sm text-slate-400">
          Manual tracking for funds, bonds, and other investments will be implemented in Module 2.
        </p>
      </Card>
    </div>
  );
};
