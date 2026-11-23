import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useSystemLogs } from '../context/SystemLogContext';
import { useSettings } from '../context/SettingsContext';
import hospitalBg from '../assets/images/hospital_architectural_bg_1795105644199.jpg';
import {
  ShieldCheck,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  HeartPulse,
  AlertTriangle
} from 'lucide-react';

export function LoginScreen() {
  const { login } = useContext(AuthContext);
  const { addLog } = useSystemLogs();
  const { settings } = useSettings();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bgFailed, setBgFailed] = useState(false);

  // Carrega usuário salvo se houver
  useEffect(() => {
    try {
      const savedUser = window.localStorage.getItem('hospaudit_saved_username');
      if (savedUser) {
        setUsername(savedUser);
      }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setError('');
    setLoading(true);

    try {
      const result = await login(username.trim(), password);
      if (result.success) {
        if (rememberMe) {
          try {
            window.localStorage.setItem('hospaudit_saved_username', username.trim());
          } catch {}
        } else {
          try {
            window.localStorage.removeItem('hospaudit_saved_username');
          } catch {}
        }
        addLog(username.trim(), 'Login', 'Acesso autenticado com sucesso no portal de auditoria.');
        setError('');
      } else {
        addLog(username.trim() || 'Desconhecido', 'Falha de Login', result.message || 'Credenciais inválidas.');
        setError(result.message || 'Credenciais inválidas. Verifique seu usuário e senha.');
      }
    } catch (err: any) {
      setError(err?.message || 'Falha na validação de login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const institutionName = settings.appName || 'Hospital Geral de Brejo Santo';

  return (
    <div className="min-h-screen relative flex flex-col justify-between overflow-x-hidden bg-[#081324] font-sans">
      {/* Hospital Architectural Backdrop */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {!bgFailed ? (
          <img
            src={hospitalBg}
            alt="Corredor e átrio hospitalar moderno"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover object-center scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#071426] via-[#0E2442] to-[#0A1A30]" />
        )}

        {/* Measured Contrast Scrim ensuring WCAG AA legibility across the viewport */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(110deg, rgba(6, 15, 30, 0.90) 0%, rgba(9, 23, 45, 0.78) 48%, rgba(8, 19, 36, 0.72) 100%)'
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 18% 25%, rgba(37, 99, 235, 0.18) 0%, transparent 55%)'
          }}
        />
      </div>

      {/* Top Bar (Desktop only so mobile/tablet shows only the login card) */}
      <header className="hidden lg:flex relative z-10 w-full max-w-6xl mx-auto px-10 pt-6 pb-2 items-center justify-between gap-8">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-600/25 border border-blue-400/35 backdrop-blur-md flex items-center justify-center text-blue-300 shrink-0">
            <HeartPulse className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight truncate">
            {institutionName}
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-xs font-medium text-slate-300 whitespace-nowrap shrink-0">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Ambiente Hospitalar Protegido</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span>LGPD &amp; RDC 36</span>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-12 my-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Clinical Context & Governance Overview (Desktop only) */}
          <section className="hidden lg:block lg:col-span-7 text-white space-y-8 animate-fade-slide">
            <div className="space-y-4">
              <p className="text-xs sm:text-sm font-semibold text-blue-300 tracking-wide">
                Gestão Assistencial · Vigilância e Segurança do Paciente
              </p>

              <h1
                className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-white leading-[1.12] tracking-tight max-w-2xl"
                style={{ textWrap: 'balance' }}
              >
                Auditoria clínica com rigor hospitalar e rastreabilidade contínua.
              </h1>

              <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed max-w-xl font-normal">
                Centralize inspeções por setor e leito, monitore indicadores de prevenção de IRAS e mantenha trilhas de auditoria em conformidade com os protocolos da unidade.
              </p>
            </div>

            {/* Clean Architectural Feature Highlights (No nested card boxes) */}
            <div className="pt-6 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl">
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-blue-300 tracking-wide">01. Vigilância IRAS</p>
                <p className="text-sm font-semibold text-white">Prevenção e Controle</p>
                <p className="text-xs text-slate-300/85 leading-relaxed">
                  Checklists estruturados à beira-leito por setor e turno.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-mono text-blue-300 tracking-wide">02. Segurança RDC 36</p>
                <p className="text-sm font-semibold text-white">Conformidade Clínica</p>
                <p className="text-xs text-slate-300/85 leading-relaxed">
                  Acompanhamento de metas assistenciais e planos de ação.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-mono text-blue-300 tracking-wide">03. Trilha Auditável</p>
                <p className="text-sm font-semibold text-white">Registro Íntegro</p>
                <p className="text-xs text-slate-300/85 leading-relaxed">
                  Histórico completo de acessos e alterações por usuário.
                </p>
              </div>
            </div>
          </section>

          {/* Right Column: Elevated Login Card */}
          <section className="lg:col-span-5 w-full max-w-md mx-auto lg:ml-auto lg:mr-0">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-fade-slide">
              {/* Panel Header */}
              <div className="px-5 sm:px-7 pt-6 sm:pt-8 pb-5 sm:pb-6 border-b border-slate-100">
                <div className="flex items-center gap-3.5 mb-4">
                  {settings.loginLogoUrl ? (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 inline-flex items-center justify-center shrink-0">
                      <img
                        src={settings.loginLogoUrl}
                        alt={settings.loginLogoText || institutionName}
                        referrerPolicy="no-referrer"
                        className="max-h-10 max-w-[10rem] object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                      <HeartPulse className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold text-slate-900 tracking-tight truncate">
                      Acessar o Portal
                    </h2>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {settings.loginLogoText || institutionName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <span>Identificação institucional</span>
                  <span aria-hidden="true">·</span>
                  <span>Acesso autorizado</span>
                </div>
              </div>

              {/* Form Body */}
              <div className="p-5 sm:p-7 pt-5 sm:pt-6">
                {error && (
                  <div
                    role="alert"
                    className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5 animate-fade-slide"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 leading-relaxed">{error}</div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Usuário */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-username"
                      className="text-xs font-bold text-slate-700 block"
                    >
                      Usuário ou E-mail Institucional
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        id="login-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoFocus
                        autoComplete="username"
                        placeholder="Digite seu usuário ou e-mail"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm font-medium border border-slate-200 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white focus:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus:outline-none transition-all placeholder:text-slate-400 text-slate-900"
                        required
                      />
                    </div>
                  </div>

                  {/* Senha */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password"
                      className="text-xs font-bold text-slate-700 block"
                    >
                      Senha de Acesso
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        placeholder="Digite sua senha"
                        className="w-full min-h-[44px] pl-10 pr-11 py-2.5 text-sm font-medium border border-slate-200 rounded-xl bg-slate-50/70 hover:bg-slate-50 focus:bg-white focus:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus:outline-none transition-all placeholder:text-slate-400 text-slate-900"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Lembrar usuário */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-600 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-600">Lembrar usuário</span>
                    </label>
                  </div>

                  {/* Botão Entrar */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[46px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/25 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 whitespace-nowrap"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Autenticando...</span>
                        </>
                      ) : (
                        <>
                          <span>Entrar no Sistema</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Uso restrito à equipe clínica e administrativa autorizada.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer (Desktop only so mobile/tablet stays focused purely on login) */}
      <footer className="hidden lg:flex relative z-10 w-full max-w-6xl mx-auto px-10 py-5 items-center justify-between gap-2 text-xs text-slate-300/80">
        <span>
          &copy; {new Date().getFullYear()} {institutionName}
        </span>
        <span className="flex items-center gap-2">
          <span>Auditoria Clínica e Segurança Assistencial</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span>Conexão Criptografada</span>
        </span>
      </footer>
    </div>
  );
}
