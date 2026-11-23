import React, { useContext } from 'react';
import { ToastContext } from '../context/ToastContext';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../lib/utils';

export function ToastContainer() {
  const { toasts, removeToast } = useContext(ToastContext);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm overflow-hidden bg-white rounded-lg shadow-lg ring-1 ring-black/5 animate-in slide-in-from-bottom-5 fade-in duration-300",
            toast.type === 'success' && "border-l-4 border-emerald-500",
            toast.type === 'error' && "border-l-4 border-rose-500",
            toast.type === 'info' && "border-l-4 border-blue-500"
          )}
        >
          <div className="p-4 flex items-start gap-3 w-full">
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">{toast.title}</p>
              {toast.message && (
                <p className="mt-1 text-sm text-slate-500">{toast.message}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center ml-4">
              <button
                onClick={() => removeToast(toast.id)}
                className="rounded-md bg-white text-slate-400 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
