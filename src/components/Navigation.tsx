import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Wallet, Layers, Clock } from 'lucide-react';

export const Navigation: React.FC = () => {
  const navItems = [
    { to: '/', label: 'Summary', icon: LayoutDashboard },
    { to: '/stock-form', label: 'Trade', icon: PlusCircle },
    { to: '/cash', label: 'Cash', icon: Wallet },
    { to: '/other', label: 'Other', icon: Layers },
    { to: '/history', label: 'History', icon: Clock },
  ];

  return (
    <nav
      id="bottom-navigation"
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-t border-white/10 px-4 py-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))' }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              id={`nav-link-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                  isActive
                    ? 'text-[#007AFF] font-semibold'
                    : 'text-[#86868b] hover:text-[#f5f5f7]'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-wide">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
