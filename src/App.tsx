/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useContext, useEffect } from 'react';
import { AuditProvider } from './context/AuditContext';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { SystemLogProvider } from './context/SystemLogContext';
import { ToastProvider, ToastContext } from './context/ToastContext';
import { LoginScreen } from './components/LoginScreen';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackendConnectionChecker } from './components/BackendConnectionBanner';

const DashboardLayout = lazy(() =>
  import('./components/DashboardLayout').then(m => ({ default: m.DashboardLayout }))
);

function AppContent() {
  const { user, logout } = useContext(AuthContext);
  const { showToast } = useContext(ToastContext);

  // Bloqueio de segurança automático por inatividade (Padrão de Segurança de Dados Clínicos)
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutos em ms
    let timerId: NodeJS.Timeout;

    const handleResetTimer = () => {
      clearTimeout(timerId);
      timerId = setTimeout(() => {
        logout();
        showToast('info', 'Segurança Hospitalar', 'Sua sessão foi encerrada automaticamente por inatividade após 15 minutos.');
      }, INACTIVITY_LIMIT);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, handleResetTimer, { passive: true });
    });

    handleResetTimer();

    return () => {
      clearTimeout(timerId);
      activityEvents.forEach(evt => {
        window.removeEventListener(evt, handleResetTimer);
      });
    };
  }, [user, logout, showToast]);

  return (
    <>
      <BackendConnectionChecker />
      {!user ? (
        <LoginScreen />
      ) : (
        <Suspense
          fallback={
            <div className="min-h-screen bg-[#F3F7FA] flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-500">Carregando ambiente clínico...</p>
              </div>
            </div>
          }
        >
          <DashboardLayout />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <SystemLogProvider>
          <AuthProvider>
            <AuditProvider>
              <ErrorBoundary>
                <AppContent />
                <ToastContainer />
              </ErrorBoundary>
            </AuditProvider>
          </AuthProvider>
        </SystemLogProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
