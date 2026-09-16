import React from 'react';

export function GlassCard({ children, className = '', ...props }) {
  return (
    <div
      className={`apple-glass rounded-3xl p-6 shadow-2xl transition-all duration-300 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
