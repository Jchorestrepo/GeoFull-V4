import React from 'react';

export function Badge({ children, variant = 'titanium', className = '' }) {
  const variants = {
    titanium: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    red: 'bg-red-500/20 text-red-300 border-red-500/30',
    slate: 'bg-slate-800 text-slate-300 border-slate-700'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-tight border backdrop-blur-md ${variants[variant] || variants.slate} ${className}`}>
      {children}
    </span>
  );
}
