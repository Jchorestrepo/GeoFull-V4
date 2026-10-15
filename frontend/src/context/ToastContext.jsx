import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast } from '../components/ui/Toast';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toastData, setToastData] = useState(null);

  const showToast = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    setToastData({ type, title, message, duration });
  }, []);

  const hideToast = useCallback(() => {
    setToastData(null);
  }, []);

  const toast = {
    show: showToast,
    hide: hideToast,
    success: (message, title = 'Operación Exitosa', duration = 4000) =>
      showToast({ type: 'success', title, message, duration }),
    error: (message, title = 'Error', duration = 5000) =>
      showToast({ type: 'error', title, message, duration }),
    warning: (message, title = 'Atención', duration = 4500) =>
      showToast({ type: 'warning', title, message, duration }),
    info: (message, title = 'Información', duration = 4000) =>
      showToast({ type: 'info', title, message, duration }),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toastData && (
        <Toast
          type={toastData.type}
          title={toastData.title}
          message={toastData.message}
          duration={toastData.duration}
          onClose={hideToast}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe ser utilizado dentro de un ToastProvider');
  }
  return context;
}
