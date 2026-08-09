import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  id?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, id }) => {
  return (
    <div
      id={id}
      onClick={onClick}
      className={`bg-[#161617] border border-white/5 rounded-2xl p-4 shadow-sm backdrop-blur-sm transition-all ${
        onClick ? 'cursor-pointer hover:border-white/10 active:scale-[0.99]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};
