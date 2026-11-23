import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface AppSettings {
  appName: string;
  appIconLetter: string;
  loginLogoText?: string;
  loginLogoUrl?: string;
  installedModules?: string[];
  theme?: 'light' | 'dark';
  sarahWebUrl?: string;
  sarahWebProxyEnabled?: boolean;
  vpnEnabled?: boolean;
  vpnServer?: string;
  vpnPort?: string;
  vpnProtocol?: string;
  vpnSubnet?: string;
  vpnUser?: string;
  vpnPassword?: string;
  vpnInstructions?: string;
  siteTitle?: string;
  mysqlHost?: string;
  mysqlPort?: string;
  mysqlDb?: string;
  mysqlUser?: string;
  mysqlPass?: string;
  dbHost?: string;
  dbPort?: string;
  dbName?: string;
  dbUser?: string;
  dbPassword?: string;
  backupAutoEnabled?: boolean;
  backupFrequency?: string; // '1h' | '6h' | '12h' | '24h' | '7d'
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  toggleTheme: () => void;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const defaultSettings: AppSettings = {
  appName: 'HOSPITAL GERAL | IMTAVI',
  appIconLetter: 'HG',
  loginLogoText: 'HospAudit',
  loginLogoUrl: '',
  installedModules: ['DASHBOARD', 'INDICADORES', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'REPORTS', 'USERS_PERMISSIONS'],
  theme: 'light',
  sarahWebUrl: 'http://sarah.hgbs.lan:8080/Sarah',
  sarahWebProxyEnabled: false,
  vpnEnabled: false,
  vpnServer: 'vpn.hgbs.lan',
  vpnPort: '1194',
  vpnProtocol: 'OpenVPN (UDP)',
  vpnSubnet: '10.8.0.0/24',
  vpnUser: '',
  vpnPassword: '',
  vpnInstructions: 'Baixe o cliente OpenVPN oficial. Cole as credenciais ou importe o perfil .ovpn disponibilizado pela TI para acessar a rede hospitalar de qualquer lugar.',
  siteTitle: 'My Google AI Studio App',
  mysqlHost: 'localhost',
  mysqlPort: '3306',
  mysqlDb: 'hospaudit',
  mysqlUser: 'root',
  mysqlPass: '',
  dbHost: '',
  dbPort: '5432',
  dbName: '',
  dbUser: '',
  dbPassword: '',
  backupAutoEnabled: true,
  backupFrequency: '24h'
};

const safeLocalStorage = {
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      try {
        window.sessionStorage.setItem(key, value);
      } catch (err) {
        console.warn(`[LocalStorage] Não foi possível salvar a chave "${key}" (armazenamento cheio ou restrito):`, err);
      }
    }
  },
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      try {
        return window.sessionStorage.getItem(key);
      } catch (err) {
        console.warn(`[LocalStorage] Não foi possível ler a chave "${key}":`, err);
        return null;
      }
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      try {
        window.sessionStorage.removeItem(key);
      } catch (err) {
        console.warn(`[LocalStorage] Não foi possível remover a chave "${key}":`, err);
      }
    }
  },
  clear: () => {
    try {
      window.localStorage.clear();
    } catch (e) {
      try {
        window.sessionStorage.clear();
      } catch (err) {
        console.warn('[LocalStorage] Não foi possível limpar o storage:', err);
      }
    }
  }
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = safeLocalStorage.getItem('hospaudit_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.appName === 'MedAudit Pro' || parsed.appName === 'Hospital Geral' || !parsed.appName) {
          parsed.appName = 'HOSPITAL GERAL | IMTAVI';
          parsed.appIconLetter = 'HG';
        }
        // Migrar ou inicializar valores default novos
        if (parsed.loginLogoText === undefined) {
          parsed.loginLogoText = 'HospAudit';
        }
        if (parsed.loginLogoUrl === undefined) {
          parsed.loginLogoUrl = '';
        }
        if (parsed.siteTitle === undefined) {
          parsed.siteTitle = 'My Google AI Studio App';
        }
        // Force light theme
        parsed.theme = 'light';
        if (parsed.sarahWebUrl === undefined) {
          parsed.sarahWebUrl = 'http://sarah.hgbs.lan:8080/Sarah';
        }
        if (parsed.sarahWebProxyEnabled === undefined) {
          parsed.sarahWebProxyEnabled = false;
        }
        if (parsed.vpnEnabled === undefined) {
          parsed.vpnEnabled = false;
        }
        if (parsed.vpnServer === undefined) {
          parsed.vpnServer = 'vpn.hgbs.lan';
        }
        if (parsed.vpnPort === undefined) {
          parsed.vpnPort = '1194';
        }
        if (parsed.vpnProtocol === undefined) {
          parsed.vpnProtocol = 'OpenVPN (UDP)';
        }
        if (parsed.vpnSubnet === undefined) {
          parsed.vpnSubnet = '10.8.0.0/24';
        }
        if (parsed.vpnUser === undefined) {
          parsed.vpnUser = '';
        }
        if (parsed.vpnPassword === undefined) {
          parsed.vpnPassword = '';
        }
        if (parsed.vpnInstructions === undefined) {
          parsed.vpnInstructions = 'Baixe o cliente OpenVPN oficial. Cole as credenciais ou importe o perfil .ovpn disponibilizado pela TI para acessar a rede hospitalar de qualquer lugar.';
        }
        if (parsed.mysqlHost === undefined) {
          parsed.mysqlHost = 'localhost';
        }
        if (parsed.mysqlPort === undefined) {
          parsed.mysqlPort = '3306';
        }
        if (parsed.mysqlDb === undefined) {
          parsed.mysqlDb = 'hospaudit';
        }
        if (parsed.mysqlUser === undefined) {
          parsed.mysqlUser = 'root';
        }
        if (parsed.mysqlPass === undefined) {
          parsed.mysqlPass = '';
        }
        if (parsed.dbHost === undefined) {
          parsed.dbHost = '';
        }
        if (parsed.dbPort === undefined) {
          parsed.dbPort = '5432';
        }
        if (parsed.dbName === undefined) {
          parsed.dbName = '';
        }
        if (parsed.dbUser === undefined) {
          parsed.dbUser = '';
        }
        if (parsed.dbPassword === undefined) {
          parsed.dbPassword = '';
        }
        if (parsed.backupAutoEnabled === undefined) {
          parsed.backupAutoEnabled = true;
        }
        if (parsed.backupFrequency === undefined) {
          parsed.backupFrequency = '24h';
        }
        if (!parsed.installedModules) {
          parsed.installedModules = ['DASHBOARD', 'INDICADORES', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'REPORTS', 'USERS_PERMISSIONS'];
        } else {
          // Remover qualquer módulo que tenha sido banido/excluído
          const forbidden = ['AGENDA', 'FORMULARIO', 'FORM_LESAO', 'FORM_CATETER', 'VOTING', 'PATIENTS', 'EQUIPAMENTOS', 'EQUIP_MAINTENANCE', 'FINANCEIRO', 'AGENDAMENTO_WHATSAPP', 'PRONTUARIO_ELETRONICO', 'FATURAMENTO_HOSPITALAR', 'VOTE_MODELS', 'VOTE_IMPORT', 'VOTE_BOOTH', 'VOTE_RESULTS'];
          parsed.installedModules = parsed.installedModules.filter((m: string) => !forbidden.includes(m));
          
          // Garantir que os essenciais estão inclusos
          const essentialModules = ['DASHBOARD', 'INDICADORES', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'REPORTS', 'USERS_PERMISSIONS'];
          essentialModules.forEach(m => {
            if (!parsed.installedModules.includes(m)) {
              parsed.installedModules.push(m);
            }
          });
        }
        return parsed;
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  useEffect(() => {
    // Ensure light theme in settings
    if (settings.theme !== 'light') {
      setSettings(prev => ({ ...prev, theme: 'light' }));
    }
    safeLocalStorage.setItem('hospaudit_settings', JSON.stringify({ ...settings, theme: 'light' }));
    
    // Always remove dark class
    const root = window.document.documentElement;
    root.classList.remove('dark');

    // Update document title dynamically
    if (settings.siteTitle) {
      window.document.title = settings.siteTitle;
    }
  }, [settings]);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings, theme: 'light' }));
  };

  const toggleTheme = () => {
    // No-op or keep light theme
    setSettings(prev => ({
      ...prev,
      theme: 'light'
    }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, toggleTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
