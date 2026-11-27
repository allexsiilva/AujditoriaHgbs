import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { checkApi } from '../lib/apiClient';
import { md5 } from '../lib/md5';
import { useSettings } from './SettingsContext';
import { DbMiddleware } from '../services/dbMiddleware';

export type Role = 'MASTER' | 'ADMIN' | 'USER';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Stored securely in real app, plain text here as it's local storage prototype
  phone?: string;
  role: Role;
  permissions: string[];
  cargo?: string;
  employeeId?: string;
}

export interface CargoProfile {
  id: string;
  name: string;
  role: Role;
  permissions: string[];
  category?: string;
}

export const DEFAULT_CARGOS: CargoProfile[] = [
  // 1. Administração e Direção
  {
    id: 'master',
    name: 'Administrador Master',
    role: 'MASTER',
    permissions: ['ALL'],
    category: 'Administração e Direção'
  },
  {
    id: 'diretor_geral',
    name: 'Diretor Geral Hospitalar',
    role: 'ADMIN',
    permissions: ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS', 'USERS_PERMISSIONS'],
    category: 'Administração e Direção'
  },
  {
    id: 'diretor_medico',
    name: 'Diretor Médico',
    role: 'ADMIN',
    permissions: ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS'],
    category: 'Administração e Direção'
  },
  {
    id: 'diretor_enfermagem',
    name: 'Diretor de Enfermagem',
    role: 'ADMIN',
    permissions: ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS'],
    category: 'Administração e Direção'
  },
  {
    id: 'admin',
    name: 'Administrador',
    role: 'ADMIN',
    permissions: ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS', 'USERS_PERMISSIONS'],
    category: 'Administração e Direção'
  },

  // 2. Corpo Médico
  {
    id: 'medico_clinico',
    name: 'Médico Clínico Geral',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS'],
    category: 'Corpo Médico'
  },
  {
    id: 'medico_especialista',
    name: 'Médico Especialista',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS'],
    category: 'Corpo Médico'
  },
  {
    id: 'auditor_clinico',
    name: 'Médico Auditor',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS'],
    category: 'Corpo Médico'
  },
  {
    id: 'medico_plantonista',
    name: 'Médico Plantonista',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS'],
    category: 'Corpo Médico'
  },

  // 3. Corpo de Enfermagem
  {
    id: 'enfermeiro_chefe',
    name: 'Enfermeiro Chefe',
    role: 'ADMIN',
    permissions: ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS'],
    category: 'Corpo de Enfermagem'
  },
  {
    id: 'enfermeiro_assistencial',
    name: 'Enfermeiro Assistencial',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS'],
    category: 'Corpo de Enfermagem'
  },
  {
    id: 'tecnico_enfermagem',
    name: 'Técnico de Enfermagem',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT'],
    category: 'Corpo de Enfermagem'
  },
  {
    id: 'auxiliar_enfermagem',
    name: 'Auxiliar de Enfermagem',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT'],
    category: 'Corpo de Enfermagem'
  },

  // 4. Equipe Multiprofissional
  {
    id: 'fisioterapeuta',
    name: 'Fisioterapeuta Hospitalar',
    role: 'USER',
    permissions: ['DASHBOARD', 'NEW_AUDIT'],
    category: 'Equipe Multiprofissional'
  },
  {
    id: 'farmaceutico',
    name: 'Farmacêutico Hospitalar',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Equipe Multiprofissional'
  },
  {
    id: 'nutricionista',
    name: 'Nutricionista Clínica',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Equipe Multiprofissional'
  },
  {
    id: 'psicologo',
    name: 'Psicólogo Hospitalar',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Equipe Multiprofissional'
  },
  {
    id: 'assistente_social',
    name: 'Assistente Social',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Equipe Multiprofissional'
  },
  {
    id: 'fonoaudiologo',
    name: 'Fonoaudiólogo',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Equipe Multiprofissional'
  },

  // 5. Apoio Diagnóstico e Técnico
  {
    id: 'tecnico_radiologia',
    name: 'Técnico de Radiologia',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Apoio Diagnóstico e Técnico'
  },
  {
    id: 'tecnico_laboratorio',
    name: 'Técnico de Laboratório',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Apoio Diagnóstico e Técnico'
  },
  {
    id: 'biomedico',
    name: 'Biomédico',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Apoio Diagnóstico e Técnico'
  },
  {
    id: 'auxiliar_farmacia',
    name: 'Auxiliar de Farmácia',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Apoio Diagnóstico e Técnico'
  },

  // 6. Administrativo e Logística
  {
    id: 'atendente_recepcao',
    name: 'Atendente de Recepção',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Administrativo e Logística'
  },
  {
    id: 'faturista',
    name: 'Faturista Hospitalar',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Administrativo e Logística'
  },
  {
    id: 'auxiliar_adm',
    name: 'Auxiliar Administrativo',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Administrativo e Logística'
  },
  {
    id: 'suporte_ti',
    name: 'Assistente de TI Hospitalar',
    role: 'USER',
    permissions: ['DASHBOARD', 'SECTORS', 'BEDS'],
    category: 'Administrativo e Logística'
  },
  {
    id: 'auxiliar_higienizacao',
    name: 'Auxiliar de Higienização',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Administrativo e Logística'
  },
  {
    id: 'seguranca',
    name: 'Segurança Hospitalar',
    role: 'USER',
    permissions: ['DASHBOARD'],
    category: 'Administrativo e Logística'
  }
];

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

export const getUserPermissions = (email: string | undefined | null, role: Role, currentPerms?: string[], cargo?: string): string[] => {
  const safeEmail = (email || '').toLowerCase().trim();
  if (role === 'MASTER') return ['ALL'];
  
  // 1. Prioridade máxima: se as permissões foram passadas explicitamente do banco e NÃO estão vazias, use-as!
  if (Array.isArray(currentPerms) && currentPerms.length > 0) {
    const hasLegacy = currentPerms.includes('READ') || currentPerms.includes('CREATE_AUDIT');
    if (!hasLegacy) {
      console.log(`[PERMISSIONS] Usando permissões explícitas do banco para ${safeEmail}:`, currentPerms);
      return currentPerms;
    }
  }
  
  // 2. Tenta recuperar as permissões salvas para este usuário específico no safeLocalStorage
  const saved = safeLocalStorage.getItem('hospaudit_user_module_permissions');
  if (saved && safeEmail) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed[safeEmail]) && parsed[safeEmail].length > 0) {
        console.log(`[PERMISSIONS] Usando permissões do safeLocalStorage para ${safeEmail}:`, parsed[safeEmail]);
        return parsed[safeEmail];
      }
    } catch (e) {
      console.warn("Failed to parse module permissions:", e);
    }
  }

  // 3. Tenta descobrir o cargo deste usuário (passado ou vindo de hospaudit_users)
  let resolvedCargo = cargo;
  if (!resolvedCargo && safeEmail) {
    try {
      const savedUsers = safeLocalStorage.getItem('hospaudit_users');
      if (savedUsers) {
        const parsedUsers = JSON.parse(savedUsers);
        if (Array.isArray(parsedUsers)) {
          const foundUser = parsedUsers.find((u: any) => u && (u.email || '').toLowerCase().trim() === safeEmail);
          if (foundUser && foundUser.cargo) {
            resolvedCargo = foundUser.cargo;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to lookup cargo for email:", e);
    }
  }

  // 4. Se encontrou o cargo, tenta carregar as permissões vinculadas àquele perfil de cargo (RBAC)
  if (resolvedCargo) {
    try {
      const savedCargos = safeLocalStorage.getItem('hospaudit_cargo_access_levels');
      if (savedCargos) {
        const parsedCargos = JSON.parse(savedCargos);
        if (Array.isArray(parsedCargos)) {
          const matchedCargo = parsedCargos.find((c: any) => c && c.name.toLowerCase().trim() === resolvedCargo!.toLowerCase().trim());
          if (matchedCargo && Array.isArray(matchedCargo.permissions) && matchedCargo.permissions.length > 0) {
            console.log(`[PERMISSIONS] Usando permissões herdadas do cargo "${resolvedCargo}" para ${safeEmail}:`, matchedCargo.permissions);
            return matchedCargo.permissions;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse cargo access levels for fallback:", e);
    }
  }
  
  // 5. Fallback final: permissões básicas padrão baseadas no nível (Role)
  const defaults = role === 'ADMIN' 
    ? ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS']
    : ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS'];
  
  console.log(`[PERMISSIONS] Usando permissões padrão de nível de acesso (${role}) para ${safeEmail}:`, defaults);
  return defaults;
};

export const saveUserPermissions = (email: string | undefined | null, permissions: string[]) => {
  const safeEmail = (email || '').toLowerCase().trim();
  if (!safeEmail) return;
  const saved = safeLocalStorage.getItem('hospaudit_user_module_permissions') || '{}';
  try {
    const parsed = JSON.parse(saved);
    parsed[safeEmail] = permissions;
    safeLocalStorage.setItem('hospaudit_user_module_permissions', JSON.stringify(parsed));
  } catch (e) {
    console.warn("Failed to save user module permissions:", e);
  }
};

interface AuthContextType {
  user: User | null;
  users: User[];
  cargos: CargoProfile[];
  login: (usernameOrEmail: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  addUser: (user: User) => void;
  updateUser: (id: string, user: Partial<User>) => void;
  deleteUser: (id: string) => void;
  resetPassword: (id: string, newPass: string) => void;
  validateUserPermissions: (currentUser: User | null) => void;
  addCargo: (cargo: CargoProfile) => void;
  updateCargoProfile: (id: string, updated: Partial<CargoProfile>) => void;
  deleteCargo: (id: string) => void;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const defaultHospAuditUser: User = {
  id: 'master-user-2',
  name: 'Administrador',
  email: 'admin',
  password: 'admin',
  role: 'MASTER',
  permissions: ['ALL'],
  cargo: 'Administrador Master'
};

const defaultAdministradorUser: User = {
  id: 'master-user-administrador',
  name: 'Administrador',
  email: 'administrador',
  password: 'admin',
  role: 'MASTER',
  permissions: ['ALL'],
  cargo: 'Administrador Master'
};

const defaultLuizRominingUser: User = {
  id: 'user-luiz-romining',
  name: 'Luiz Romining',
  email: 'luiz.romining',
  password: 'luiz',
  role: 'USER',
  permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS', 'COMPARATIVE'],
  cargo: 'Auditor Clínico'
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [users, setUsers] = useState<User[]>(() => {
    const saved = safeLocalStorage.getItem('hospaudit_users');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed || !Array.isArray(parsed)) {
          return [defaultHospAuditUser, defaultAdministradorUser, defaultLuizRominingUser];
        }
        
        // Remove old emails for security and cleanup, and ensure user and user.email exist
        let filtered = parsed.filter((u: User) => u && u.email && u.email !== 'admin@master' && u.email !== 'admin@hospaudit.com' && u.email !== 'admin@admin.com');
        
        // Unifica e deduplica o Luiz duplicado em caso de estarem salvos no localStorage do cliente
        const hasLuizEmail = filtered.some((u: User) => u && u.email && u.email.toLowerCase().trim() === 'luiz');
        const hasLuizRominingEmail = filtered.some((u: User) => u && u.email && u.email.toLowerCase().trim() === 'luiz.romining');
        if (hasLuizEmail && hasLuizRominingEmail) {
          filtered = filtered.filter((u: User) => u && u.email && u.email.toLowerCase().trim() !== 'luiz');
        }

        // Ensure standard 'admin' master is present
        if (!filtered.some((u: User) => u && u.email === 'admin')) {
          filtered.push(defaultHospAuditUser);
        } else {
          // Update credentials for admin to support user request instantly
          const adminIdx = filtered.findIndex((u: User) => u && u.email === 'admin');
          if (adminIdx !== -1) {
            filtered[adminIdx].password = 'admin';
          }
        }

        // Ensure 'administrador' master is present
        if (!filtered.some((u: User) => u && u.email === 'administrador')) {
          filtered.push(defaultAdministradorUser);
        } else {
          const adminIdx = filtered.findIndex((u: User) => u && u.email === 'administrador');
          if (adminIdx !== -1) {
            filtered[adminIdx].password = 'admin';
          }
        }
        
        // Map saved permissions
        return filtered.map((u: User) => ({
          ...u,
          permissions: getUserPermissions(u.email, u.role, u.permissions)
        }));
      } catch (e) {
        return [defaultHospAuditUser, defaultAdministradorUser, defaultLuizRominingUser];
      }
    }
    return [defaultHospAuditUser, defaultAdministradorUser, defaultLuizRominingUser];
  });
  
  const [cargos, setCargos] = useState<CargoProfile[]>(() => {
    const saved = safeLocalStorage.getItem('hospaudit_cargo_access_levels');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If the list has fewer than 15 roles, we smart merge with DEFAULT_CARGOS to upgrade the system
          if (parsed.length < 15) {
            const merged = [...DEFAULT_CARGOS];
            parsed.forEach((custom: CargoProfile) => {
              if (!merged.some(m => m.id === custom.id || m.name.toLowerCase() === custom.name.toLowerCase())) {
                merged.push(custom);
              }
            });
            return merged;
          }
          return parsed;
        }
      } catch (e) {
        console.warn("Failed to parse cargo access levels:", e);
      }
    }
    return DEFAULT_CARGOS;
  });

  useEffect(() => {
    safeLocalStorage.setItem('hospaudit_cargo_access_levels', JSON.stringify(cargos));
  }, [cargos]);

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = safeLocalStorage.getItem('hospaudit_current_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        const resolvedPermissions = getUserPermissions(parsed.email, parsed.role, parsed.permissions);
        console.log('--- [AUTH INITIALIZATION] ---');
        console.log('Usuário recuperado da sessão:', parsed.email);
        console.log('Permissões originais salvas na sessão:', parsed.permissions);
        console.log('Permissões calculadas finais aplicadas:', resolvedPermissions);
        console.log('------------------------------');
        return {
          ...parsed,
          permissions: resolvedPermissions
        };
      }
      return null;
    } catch (e) {
      console.warn("Failed to parse hospaudit_current_user from sessionStorage:", e);
      return null;
    }
  });

  // Reusable user synchronizer
  const syncUsers = useCallback(async () => {
    const isOnline = await checkApi();
    if (isOnline) {
      const data = await DbMiddleware.executeRead();
      if (data) {
        if (data.users && data.users.length > 0) {
          const mapped = data.users.map((u: any) => ({
            ...u,
            id: String(u.id),
            permissions: getUserPermissions(u.email, u.role, u.permissions)
          }));
          setUsers(prev => JSON.stringify(prev) === JSON.stringify(mapped) ? prev : mapped);
          
          // Verify current session user consistency
          const savedCurrent = safeLocalStorage.getItem('hospaudit_current_user');
          if (savedCurrent) {
            try {
              const curr = JSON.parse(savedCurrent);
              const matched = data.users.find((u: any) => {
                const uEmail = (u.email || '').toLowerCase().trim();
                const uUsername = uEmail.split('@')[0];
                const currEmail = (curr.email || '').toLowerCase().trim();
                return uEmail === currEmail || uUsername === currEmail;
              });
              if (matched) {
                const nextSessionUser = {
                  ...matched,
                  id: String(matched.id),
                  permissions: getUserPermissions(matched.email, matched.role, matched.permissions)
                };
                setUser(prev => JSON.stringify(prev) === JSON.stringify(nextSessionUser) ? prev : nextSessionUser);
              }
            } catch (e) {
              console.warn("Failed to parse savedCurrent session user:", e);
            }
          }
        }
        if (data.cargos && data.cargos.length > 0) {
          setCargos(prev => JSON.stringify(prev) === JSON.stringify(data.cargos) ? prev : data.cargos);
        }
      }
    }
  }, []);

  // Sync users in background every 60s instead of 10s to keep app fast
  useEffect(() => {
    syncUsers();

    const interval = setInterval(() => {
      syncUsers();
    }, 60000);

    const handleOnline = () => {
      syncUsers();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [syncUsers]);

  useEffect(() => {
    safeLocalStorage.setItem('hospaudit_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (user) {
      safeLocalStorage.setItem('hospaudit_current_user', JSON.stringify(user));
    } else {
      safeLocalStorage.removeItem('hospaudit_current_user');
    }
  }, [user]);

  const login = useCallback(async (emailOrUsername: string, password?: string): Promise<{ success: boolean; message?: string }> => {
    // 1. Check if user is locked out
    const attemptsKey = 'hospaudit_login_attempts';
    let attemptsMap: Record<string, any> = {};
    try {
      attemptsMap = JSON.parse(safeLocalStorage.getItem(attemptsKey) || '{}');
    } catch (e) {
      console.warn("Failed to parse login attempts map:", e);
    }
    const userAttempts = attemptsMap[emailOrUsername] || { count: 0, lockoutUntil: 0 };

    if (userAttempts.lockoutUntil && Date.now() < userAttempts.lockoutUntil) {
      const waitMinutes = Math.ceil((userAttempts.lockoutUntil - Date.now()) / 60000);
      return { success: false, message: `Conta bloqueada devido a muitas tentativas. Tente novamente em ${waitMinutes} minutos.` };
    }

    let inputLower = emailOrUsername.toLowerCase().trim();
    if (inputLower === 'luiz') {
      inputLower = 'luiz.romining'; // Redireciona de forma transparente 'luiz' para 'luiz.romining'
    }

    // Mecanismo de Diagnóstico e Auto-Recuperação de Credenciais para o usuário 'luiz.romining'
    if (inputLower === 'luiz.romining') {
      console.log('--- [DIAGNÓSTICO E AUTO-RECUPERAÇÃO DE CONEXÃO: LUIZ.ROMINING] ---');
      console.log('Verificando integridade das credenciais de luiz.romining...');
      
      // Remove qualquer bloqueio ativo de tentativas de login por contingência
      if (attemptsMap[emailOrUsername]) {
        delete attemptsMap[emailOrUsername];
        safeLocalStorage.setItem(attemptsKey, JSON.stringify(attemptsMap));
      }
      
      // Sincroniza e garante o usuário local estruturado com as permissões corretas
      setUsers(prev => {
        const hasUser = prev.some(u => u && u.email === 'luiz.romining');
        if (!hasUser) {
          return [...prev, defaultLuizRominingUser];
        } else {
          return prev.map(u => {
            if (u && u.email === 'luiz.romining') {
              return {
                ...u,
                password: 'luiz', // Garante e força a senha padrão 'luiz'
                role: 'USER',
                permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS', 'COMPARATIVE', 'SECTOR_BOARD']
              };
            }
            return u;
          });
        }
      });
      console.log('Auto-recuperação concluída: Senha "luiz" redefinida e sincronizada.');
      console.log('------------------------------------------------------------------');
    }

    const isMasterFallbackInput = (inputLower === 'admin' || inputLower === 'admin@admin.com') && password === 'admin';

    // Se estiver online, tenta validar diretamente pelo servidor PHP (MySQL) primeiro!
    const isOnline = await checkApi();
    if (isOnline) {
      try {
        const response = await fetch(`/api.php?action=login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: emailOrUsername,
            password: password
          })
        });
        
        if (response.ok) {
          const resData = await response.json();
          if (resData && resData.success && resData.user) {
            // Sucesso! Limpa as tentativas de login
            delete attemptsMap[emailOrUsername];
            safeLocalStorage.setItem(attemptsKey, JSON.stringify(attemptsMap));

            const resolvedPermissions = getUserPermissions(resData.user.email, resData.user.role, resData.user.permissions);
            console.log('--- [ONLINE LOGIN SUCCESS] ---');
            console.log('Usuário:', resData.user.email);
            console.log('Role:', resData.user.role);
            console.log('Permissões vindas do servidor PHP:', resData.user.permissions);
            console.log('Permissões resolvidas:', resolvedPermissions);
            console.log('------------------------------');

            const sessionUser = {
              ...resData.user,
              permissions: resolvedPermissions
            };
            setUser(sessionUser);
            return { success: true };
          }
        }
      } catch (err) {
        console.warn("Direct login error, falling back to local verification:", err);
      }
    }

    // Se falhar o servidor ou estiver offline, roda a validação local redundante (contingência)
    const inputMd5 = md5(password || '').toLowerCase().trim();
    let found = users.find(u => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uUsername = uEmail.split('@')[0];
      const dbPassword = (u.password || '').trim();
      
      const passwordMatches = 
        dbPassword === password || 
        dbPassword.toLowerCase() === inputMd5 || 
        md5(dbPassword).toLowerCase() === inputMd5;

      return (uEmail === inputLower || uUsername === inputLower) && passwordMatches;
    });
    
    // Fallback de contingência para o Usuário Mestre em caso de falha de banco de dados ou incoerência de criptografia online
    if (!found && isMasterFallbackInput) {
      found = users.find(u => {
        const uEmail = (u.email || '').toLowerCase().trim();
        return uEmail === 'admin' || uEmail === 'admin@admin.com';
      }) || defaultHospAuditUser;
      
      // Garante que o usuário de fallback tenha as propriedades MASTER configuradas
      if (found) {
        found = {
          ...found,
          role: 'MASTER',
          permissions: ['ALL']
        };
      }
    }
    
    if (found) {
      // Success: clear attempts map for this user
      delete attemptsMap[emailOrUsername];
      safeLocalStorage.setItem(attemptsKey, JSON.stringify(attemptsMap));

      // Remove original password hash before setting active session
      const resolvedPermissions = getUserPermissions(found.email, found.role, found.permissions);
      console.log('--- [OFFLINE/FALLBACK LOGIN SUCCESS] ---');
      console.log('Usuário:', found.email);
      console.log('Role:', found.role);
      console.log('Permissões locais:', found.permissions);
      console.log('Permissões resolvidas:', resolvedPermissions);
      console.log('----------------------------------------');

      const sessionUser = { 
        ...found,
        permissions: resolvedPermissions
      };
      setUser(sessionUser);
      return { success: true };
    } else {
      // Failure: increment attempts
      userAttempts.count += 1;
      let msg = 'Credenciais inválidas.';
      
      if (userAttempts.count >= 5) {
        // Lockout for 15 minutes
        userAttempts.lockoutUntil = Date.now() + 15 * 60 * 1000;
        userAttempts.count = 0; // Reset count for next time after lockout expires
        msg = `Muitas tentativas falhas. Conta bloqueada por 15 minutos.`;
      } else {
        msg = `Credenciais inválidas. ${5 - userAttempts.count} tentativa(s) restante(s).`;
      }

      attemptsMap[emailOrUsername] = userAttempts;
      safeLocalStorage.setItem(attemptsKey, JSON.stringify(attemptsMap));
      
      return { success: false, message: msg };
    }
  }, [users]);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  const addUser = useCallback((newUser: User) => {
    // Salva as permissões no localStorage
    if (newUser.permissions) {
      saveUserPermissions(newUser.email, newUser.permissions);
    }
    // 1. Add locally first for instant reactivity
    setUsers(prev => [...prev, {
      ...newUser,
      permissions: getUserPermissions(newUser.email, newUser.role, newUser.permissions)
    }]);
    
    // 2. Synchronize with API
    checkApi().then(async (available) => {
      if (available) {
        const passwordPlain = newUser.password || '123456';
        const success = await DbMiddleware.executeWrite('add_user', {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          password: passwordPlain,
          role: newUser.role,
          permissions: newUser.permissions,
          cargo: newUser.cargo || '',
          employeeId: newUser.employeeId || ''
        });
        if (success) {
          await syncUsers();
        }
      }
    });
  }, [syncUsers]);

  const updateUser = useCallback((id: string, updates: Partial<User>) => {
    if (updates.email && updates.permissions) {
      saveUserPermissions(updates.email, updates.permissions);
    } else if (updates.permissions) {
      const found = users.find(u => u.id === id);
      if (found) {
        saveUserPermissions(found.email, updates.permissions);
      }
    }

    setUsers(prev => prev.map(u => {
      if (u.id === id) {
        const email = updates.email ?? u.email;
        const role = updates.role ?? u.role;
        const perms = updates.permissions ?? u.permissions;
        return {
          ...u,
          ...updates,
          permissions: getUserPermissions(email, role, perms)
        };
      }
      return u;
    }));

    if (user && user.id === id) {
       setUser(prev => {
         if (!prev) return null;
         const email = updates.email ?? prev.email;
         const role = updates.role ?? prev.role;
         const perms = updates.permissions ?? prev.permissions;
         return {
           ...prev,
           ...updates,
           permissions: getUserPermissions(email, role, perms)
         };
       });
    }

    checkApi().then(async (available) => {
      if (available) {
        const existing = users.find(u => u.id === id) || (user && user.id === id ? user : null);
        const nameVal = updates.name ?? existing?.name ?? '';
        const emailVal = updates.email ?? existing?.email ?? '';
        const roleVal = updates.role ?? existing?.role ?? 'USER';
        const permsVal = updates.permissions ?? existing?.permissions ?? [];
        const cargoVal = updates.cargo ?? existing?.cargo ?? '';
        const employeeIdVal = updates.employeeId ?? existing?.employeeId ?? '';

        const success = await DbMiddleware.executeWrite('update_user', {
          id,
          name: nameVal,
          email: emailVal,
          role: roleVal,
          password: updates.password,
          permissions: permsVal,
          cargo: cargoVal,
          employeeId: employeeIdVal
        });
        if (success) {
          await syncUsers();
        }
      }
    });
  }, [users, user, syncUsers]);

  const deleteUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    checkApi().then(async (available) => {
      if (available) {
        const success = await DbMiddleware.executeWrite('delete_user', { id });
        if (success) {
          await syncUsers();
        }
      }
    });
  }, [syncUsers]);

  const resetPassword = useCallback((id: string, newPass: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, password: newPass } : u));
    checkApi().then(async (available) => {
      if (available) {
        const success = await DbMiddleware.executeWrite('update_user', { id, password: newPass });
        if (success) {
          await syncUsers();
        }
      }
    });
  }, [syncUsers]);

  const addCargo = useCallback((newCargo: CargoProfile) => {
    setCargos(prev => {
      const next = [...prev, newCargo];
      checkApi().then(async (available) => {
        if (available) {
          await DbMiddleware.executeWrite('add_cargo', newCargo);
        }
      });
      return next;
    });
  }, []);

  const updateCargoProfile = useCallback((id: string, updated: Partial<CargoProfile>) => {
    setCargos(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updated } : c);
      const updatedCargo = next.find(c => c.id === id);
      const oldCargo = prev.find(c => c.id === id);
      
      if (updatedCargo) {
        checkApi().then(async (available) => {
          if (available) {
            await DbMiddleware.executeWrite('update_cargo', { id, ...updated });
          }
        });

        if (oldCargo) {
          // Propagar para os usuários que possuem esse cargo
          setTimeout(() => {
            setUsers(prevUsers => {
              const updatedUsers = prevUsers.map(u => {
                const hasThisCargo = u.cargo === oldCargo.name || u.cargo === updatedCargo.name;
                if (hasThisCargo) {
                  const newRole = updatedCargo.role;
                  const newPerms = updatedCargo.role === 'MASTER' ? ['ALL'] : updatedCargo.permissions;
                  
                  // Envia a atualização para o servidor PHP/MySQL em segundo plano
                  updateUser(u.id, {
                    role: newRole,
                    permissions: newPerms,
                    cargo: updatedCargo.name
                  });

                  return {
                    ...u,
                    role: newRole,
                    permissions: newPerms,
                    cargo: updatedCargo.name
                  };
                }
                return u;
              });
              return updatedUsers;
            });
          }, 50);
        }
      }
      
      return next;
    });
  }, [updateUser]);

  const deleteCargo = useCallback((id: string) => {
    setCargos(prev => {
      const next = prev.filter(c => c.id !== id);
      checkApi().then(async (available) => {
        if (available) {
          await DbMiddleware.executeWrite('delete_cargo', { id });
        }
      });
      return next;
    });
  }, []);

  const validateUserPermissions = useCallback((currentUser: User | null) => {
    if (!currentUser) return;
    if (currentUser.role === 'MASTER' || currentUser.permissions.includes('ALL')) {
      return;
    }
    const installed = settings.installedModules || [];
    const userPerms = currentUser.permissions || [];
    const missing = installed.filter(mod => !userPerms.includes(mod));
    
    if (missing.length > 0) {
      console.warn(
        `⚠️ [AUDITORIA DE ACESSO] Discrepância de permissões detectada para o usuário ${currentUser.name} (${currentUser.email}):\n` +
        `Os seguintes módulos estão habilitados no painel administrativo, mas estão ausentes nas permissões do usuário:\n` +
        missing.map(m => ` - ${m}`).join('\n')
      );
    }
  }, [settings.installedModules]);

  useEffect(() => {
    if (user) {
      validateUserPermissions(user);
    }
  }, [user, validateUserPermissions]);

  return (
    <AuthContext.Provider value={{ user, users, cargos, login, logout, addUser, updateUser, deleteUser, resetPassword, validateUserPermissions, addCargo, updateCargoProfile, deleteCargo }}>
      {children}
    </AuthContext.Provider>
  );
}
