import React from 'react';
import { Calendar } from 'lucide-react';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  focusColorClass?: string;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  className = '',
  focusColorClass = 'focus:border-[#007AFF]',
  id,
  required,
  ...props
}) => {
  return (
    <div className="relative flex items-center w-full">
      <Calendar className="w-3.5 h-3.5 text-[#86868b] absolute left-3 pointer-events-none z-10 shrink-0" />
      <input
        type="date"
        id={id}
        value={value}
        onChange={onChange}
        required={required}
        className={`w-full bg-[#1c1c1e] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none ${focusColorClass} font-mono appearance-none [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer ${className}`}
        {...props}
      />
    </div>
  );
};
