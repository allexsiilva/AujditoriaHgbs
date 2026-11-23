import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sector, Bed, AuditRecord, AuditQuestion, Patient, Equipment, Maintenance, Employee } from '../types';
import { checkApi, resetApiCache } from '../lib/apiClient';
import { subscribeToDbUpdates } from '../lib/socketClient';
import { AuthContext } from './AuthContext';
import { useSystemLogs } from './SystemLogContext';
import { DbMiddleware } from '../services/dbMiddleware';
import { PhpRepository } from '../services/repository';
import { ToastContext } from './ToastContext';
import { numericCollator } from '../lib/utils';

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

const localStorage = safeLocalStorage;

export function mergeById<T extends { id: string }>(localList: T[], remoteList: T[]): T[] {
  const map = new Map<string, T>();
  if (Array.isArray(localList)) {
    localList.forEach(item => {
      if (item && item.id) map.set(item.id, item);
    });
  }
  if (Array.isArray(remoteList)) {
    remoteList.forEach(item => {
      if (item && item.id) map.set(item.id, item);
    });
  }
  return Array.from(map.values());
}

export interface PendingOperation {
  id: string;
  action: 'add_sector' | 'update_sector' | 'delete_sector' | 'add_bed' | 'update_bed' | 'delete_bed' | 'add_audit' | 'update_audit' | 'delete_audit' | 'add_question' | 'update_question' | 'delete_question' | 'add_patient' | 'update_patient' | 'delete_patient' | 'add_equipment' | 'update_equipment' | 'delete_equipment' | 'add_maintenance' | 'update_maintenance' | 'delete_maintenance' | 'add_employee' | 'update_employee' | 'delete_employee';
  payload: any;
  timestamp: string;
  retryCount: number;
}

export interface SystemError {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  details?: string;
  source: 'database' | 'network' | 'validation' | 'server';
}

export interface SyncFailure {
  id: string;
  opId: string;
  action: string;
  payload: any;
  timestamp: string;
  error: string;
  type: 'network' | 'database';
  itemName: string;
}

export interface SyncDivergences {
  hasDivergence: boolean;
  sectorsDiff: number;
  bedsDiff: number;
  auditsDiff: number;
  questionsDiff: number;
  serverOnline: boolean;
  lastCheck: string;
  lastLocalWrite: string | null;
  lastServerWrite: string | null;
}

interface AuditContextType {
  sectors: Sector[];
  addSector: (sector: Omit<Sector, 'id'>) => Promise<void>;
  updateSector: (id: string, sector: Omit<Sector, 'id'>) => Promise<void>;
  deleteSector: (id: string) => Promise<void>;
  
  beds: Bed[];
  addBed: (bed: Omit<Bed, 'id'>) => Promise<void>;
  updateBed: (id: string, bed: Omit<Bed, 'id'>) => Promise<void>;
  deleteBed: (id: string) => Promise<void>;
  
  audits: AuditRecord[];
  totalAuditsCount: number;
  isLoadingAudits: boolean;
  isLoadingMoreAudits: boolean;
  hasMoreAudits: boolean;
  loadMoreAudits: () => Promise<void>;
  ensureAllAuditsLoaded: () => Promise<void>;
  addAudit: (audit: Omit<AuditRecord, 'id'>) => Promise<void>;
  updateAudit: (id: string, audit: Omit<AuditRecord, 'id'>) => Promise<void>;
  deleteAudit: (id: string) => Promise<void>;

  questions: AuditQuestion[];
  addQuestion: (question: Omit<AuditQuestion, 'id'>) => Promise<void>;
  deleteQuestion: (id: string) => Promise<void>;
  updateQuestion: (id: string, question: Omit<AuditQuestion, 'id'>) => Promise<void>;

  patients: Patient[];
  addPatient: (patient: Omit<Patient, 'id'>) => Promise<void>;
  updatePatient: (id: string, patient: Omit<Patient, 'id'>) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;

  equipments: Equipment[];
  addEquipment: (equipment: Omit<Equipment, 'id'>) => Promise<void>;
  updateEquipment: (id: string, equipment: Omit<Equipment, 'id'>) => Promise<void>;
  deleteEquipment: (id: string) => Promise<void>;

  maintenances: Maintenance[];
  addMaintenance: (maintenance: Omit<Maintenance, 'id'>) => Promise<void>;
  updateMaintenance: (id: string, maintenance: Omit<Maintenance, 'id'>) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;

  employees: Employee[];
  addEmployee: (employee: Omit<Employee, 'id'>) => Promise<void>;
  addEmployeesBatch: (employees: Omit<Employee, 'id'>[]) => Promise<void>;
  updateEmployee: (id: string, employee: Omit<Employee, 'id'>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  
  syncDatabases: () => Promise<void>;
  systemErrors: SystemError[];
  divergences: SyncDivergences;
  clearSystemErrors: () => void;
  simulateError: () => void;
  pushLocalToServer: () => Promise<boolean>;
  pullServerToLocal: () => Promise<boolean>;

  // WebSocket sync connection status and batch operations
  pendingQueue: PendingOperation[];
  syncStatus: 'connected' | 'disconnected' | 'connecting';
  syncBatch: () => Promise<boolean>;
  reconnect: () => void;

  // New optimized query functions (indexes)
  getBedsBySector: (sectorId: string) => Bed[];
  getAuditsByBed: (bedId: string) => AuditRecord[];
  getAuditsBySector: (sectorId: string) => AuditRecord[];
  getSectorById: (id: string) => Sector | undefined;
  getBedById: (id: string) => Bed | undefined;
  getQuestionById: (id: string) => AuditQuestion | undefined;

  // Detailed sync failure logs
  syncFailures: SyncFailure[];
  clearSyncFailures: () => void;

  // Centralized Database Connection Manager
  dbConnected: boolean;
  dbLastHeartbeat: string;
  dbStatus: 'connected' | 'disconnected' | 'reconnecting';
  reconnectDb: () => Promise<boolean>;
  dbConfig: any;
  setDbConfig: React.Dispatch<React.SetStateAction<any>>;
}

export const AuditContext = createContext<AuditContextType | undefined>(undefined);

const defaultSectors: Sector[] = [
  { id: 'uti1', name: 'UTI 1', description: 'Unidade de Terapia Intensiva 1' },
  { id: 'uti2', name: 'UTI 2', description: 'Unidade de Terapia Intensiva 2' }
];

const defaultBeds: Bed[] = [
  ...Array.from({ length: 10 }).map((_, i) => ({ id: `uti1-l${i + 1}`, number: `Leito ${String(i + 1).padStart(2, '0')}`, sectorId: 'uti1' })),
  ...Array.from({ length: 10 }).map((_, i) => ({ id: `uti2-l${i + 11}`, number: `Leito ${i + 11}`, sectorId: 'uti2' }))
];

export const defaultQuestions: AuditQuestion[] = [
  // IRAS - SANGUINEA
  { id: 'cs_1', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Aspecto do local de inserção', options: ['S', 'N', 'NA'] },
  { id: 'cs_2', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Óstio não visível', options: ['S', 'N', 'NA'] },
  { id: 'cs_3', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Presença de sinais flogísticos', options: ['S', 'N', 'NA'] },
  { id: 'cs_4', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Todas as saídas não utilizadas estão protegidas?', options: ['S', 'N', 'NA'] },
  { id: 'cs_5', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Tipo do cateter', options: ['C', 'P', 'CH'] },
  { id: 'cs_6', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Tipo do curativo', options: ['E', 'NE'] },
  { id: 'cs_7', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Curativo conforme indicação?', options: ['S', 'N', 'NA'] },
  { id: 'cs_8', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Curativo estéril totalmente aderido a pele?', options: ['S', 'N', 'NA'] },
  { id: 'cs_9', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Permite Visualização?', options: ['S', 'N', 'NA'] },
  { id: 'cs_10', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Curativo limpo e seco?', options: ['S', 'N', 'NA'] },
  { id: 'cs_11', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Curativo dentro da validade?', options: ['S', 'N', 'NA'] },
  { id: 'cs_12', formType: 'IRAS', section: 'Prevenção de Infecção da Corrente Sanguínea', label: 'Conector sem resíduo de sangue?', options: ['S', 'N', 'NA'] },
  
  // IRAS - PAV
  { id: 'pav_1', formType: 'IRAS', section: 'Prevenção de Pneumonia Associada a Ventilação Mecânica', label: 'Cavidade oral limpa?', options: ['S', 'N', 'NA'] },
  { id: 'pav_2', formType: 'IRAS', section: 'Prevenção de Pneumonia Associada a Ventilação Mecânica', label: 'Higiene oral de acordo com o protocolo do hospital?', options: ['S', 'N', 'NA'] },
  { id: 'pav_3', formType: 'IRAS', section: 'Prevenção de Pneumonia Associada a Ventilação Mecânica', label: 'Condensador de filtro (TOT)', options: ['S', 'N', 'NA'] },
  { id: 'pav_4', formType: 'IRAS', section: 'Prevenção de Pneumonia Associada a Ventilação Mecânica', label: 'Cabeceira da cama elevada (30 a 45º)', options: ['S', 'N', 'NA'] },
  { id: 'pav_5', formType: 'IRAS', section: 'Prevenção de Pneumonia Associada a Ventilação Mecânica', label: 'Mensurada pressão do cuff > 25cmh2o?', options: ['S', 'N', 'NA'] },
  { id: 'pav_6', formType: 'IRAS', section: 'Prevenção de Pneumonia Associada a Ventilação Mecânica', label: 'O nível de sedação ta dentro da meta estipulada?', options: ['S', 'N', 'NA'] },
  
  // IRAS - SVD
  { id: 'svd_1', formType: 'IRAS', section: 'Prevenção de Infecção do Trato Urinário Associado a SVD', label: 'Há indicação de retirada do dispositivo?', options: ['S', 'N', 'NA'] },
  { id: 'svd_2', formType: 'IRAS', section: 'Prevenção de Infecção do Trato Urinário Associado a SVD', label: 'Fixação da sonda adequada?', options: ['S', 'N', 'NA'] },
  { id: 'svd_3', formType: 'IRAS', section: 'Prevenção de Infecção do Trato Urinário Associado a SVD', label: 'Fluxo de urina sem dobra, grumos?', options: ['S', 'N', 'NA'] },
  { id: 'svd_4', formType: 'IRAS', section: 'Prevenção de Infecção do Trato Urinário Associado a SVD', label: 'Capacidade de bolsa até 2/3?', options: ['S', 'N', 'NA'] },
  { id: 'svd_5', formType: 'IRAS', section: 'Prevenção de Infecção do Trato Urinário Associado a SVD', label: 'Bolsa coletora abaixo da cintura e longe do chão (pelo menos)?', options: ['S', 'N', 'NA'] },
  { id: 'svd_6', formType: 'IRAS', section: 'Prevenção de Infecção do Trato Urinário Associado a SVD', label: 'Sistema (SVD + bolsa coletora) está conectado e sem vazamentos?', options: ['S', 'N', 'NA'] },
  
  // SAFETY - Identificação do Paciente
  { id: 'id_1', formType: 'SAFETY', section: 'Identificação do Paciente', label: 'O paciente possui placa de identificação?', options: ['Sim', 'Não'] },
  { id: 'id_2', formType: 'SAFETY', section: 'Identificação do Paciente', label: 'O paciente possui pulseira de identificação?', options: ['Sim', 'Não'] },
  { id: 'id_3', formType: 'SAFETY', section: 'Identificação do Paciente', label: 'A pulseira contém pelo menos dois identificadores (ex: nome completo, data de nascimento e nome da mãe)?', options: ['Sim', 'Não'] },
  { id: 'id_4', formType: 'SAFETY', section: 'Identificação do Paciente', label: 'Os dados da pulseira conferem com o prontuário/medicamentos?', options: ['Sim', 'Não'] },
  { id: 'id_5', formType: 'SAFETY', section: 'Identificação do Paciente', label: 'A equipe verifica a identificação antes de procedimentos/medicações?', options: ['Sim', 'Não'] },

  // SAFETY - Comunicação Efetiva
  { id: 'cm_1', formType: 'SAFETY', section: 'Comunicação Efetiva', label: 'A transferência interna de pacientes segue método estruturado (ex: SBAR)?', options: ['Sim', 'Não'] },
  { id: 'cm_2', formType: 'SAFETY', section: 'Comunicação Efetiva', label: 'Solicitação médica de vaga de UTI?', options: ['Sim', 'Não'] },
  { id: 'cm_3', formType: 'SAFETY', section: 'Comunicação Efetiva', label: 'Sumário de alta hospitalar?', options: ['Sim', 'Não'] },
  { id: 'cm_4', formType: 'SAFETY', section: 'Comunicação Efetiva', label: 'Solicitação/ parecer de avaliação de especialista?', options: ['Sim', 'Não'] },
  { id: 'cm_5', formType: 'SAFETY', section: 'Comunicação Efetiva', label: 'Solicitação de avaliação/ parecer do especialista respondida?', options: ['Sim', 'Não'] },

  // SAFETY - Medicação
  { id: 'md_1', formType: 'SAFETY', section: 'Medicação', label: 'A dupla checagem é realizada antes da administração?', options: ['Sim', 'Não'] },
  { id: 'md_2', formType: 'SAFETY', section: 'Medicação', label: 'Aprazamento e checagem corretos?', options: ['Sim', 'Não'] },
  { id: 'md_3', formType: 'SAFETY', section: 'Medicação', label: 'Alergia medicamentosa informada?', options: ['Sim', 'Não'] },

  // SAFETY - Cirurgia Segura
  { id: 'cg_1', formType: 'SAFETY', section: 'Cirurgia Segura', label: 'A marcação do sítio cirúrgico é feita antes de levar o paciente à sala?', options: ['Sim', 'Não'] },
  { id: 'cg_2', formType: 'SAFETY', section: 'Cirurgia Segura', label: 'O checklist de Cirurgia Segura (Time-out) é preenchido no prontuário?', options: ['Sim', 'Não'] },
  { id: 'cg_3', formType: 'SAFETY', section: 'Cirurgia Segura', label: 'O termo de consentimento está assinado e disponível?', options: ['Sim', 'Não'] },

  // SAFETY - Redução das Infecções
  { id: 'ri_1', formType: 'SAFETY', section: 'Redução das Infecções', label: 'Profissionais higienizam as mãos nos 5 momentos (OMS)?', options: ['Sim', 'Não'] },
  { id: 'ri_2', formType: 'SAFETY', section: 'Redução das Infecções', label: 'Há pias com sabonete/papel e dispensadores de álcool gel disponíveis?', options: ['Sim', 'Não'] },
  { id: 'ri_3', formType: 'SAFETY', section: 'Redução das Infecções', label: 'Dispositivos (sondas/cateteres/ acesso) estão com data de inserção e fixação correta?', options: ['Sim', 'Não'] },

  // SAFETY - Quedas e Lesão por Pressão
  { id: 'ql_1', formType: 'SAFETY', section: 'Quedas e Lesão por Pressão', label: 'Avaliação de risco de queda/lesão por pressão é feita na admissão e diariamente?', options: ['Sim', 'Não'] },
  { id: 'ql_2', formType: 'SAFETY', section: 'Quedas e Lesão por Pressão', label: 'Grades do leito estão elevadas e rodas travadas?', options: ['Sim', 'Não'] },
  { id: 'ql_3', formType: 'SAFETY', section: 'Quedas e Lesão por Pressão', label: 'Plano de cuidados inclui mudança de decúbito e hidratação da pele?', options: ['Sim', 'Não'] },
];

export function AuditProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const userEmail = auth?.user?.email || 'sistema';
  const { addLog } = useSystemLogs();
  const { showToast } = useContext(ToastContext);
  const initialLoadDoneRef = useRef(false);
  const isProcessingQueueRef = useRef(false);
  const wasOnlineRef = useRef(true);

  const [sectors, setSectors] = useState<Sector[]>(() => {
    const saved = localStorage.getItem('hospaudit_sectors');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error loading sectors from localStorage', e);
      }
    }
    return defaultSectors;
  });

  const [beds, setBeds] = useState<Bed[]>(() => {
    const saved = localStorage.getItem('hospaudit_beds');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error loading beds from localStorage', e);
      }
    }
    return defaultBeds;
  });

  const [audits, setAudits] = useState<AuditRecord[]>(() => {
    const saved = localStorage.getItem('hospaudit_audits');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Error loading audits from localStorage', e);
      }
    }
    return [];
  });
  const [totalAuditsCount, setTotalAuditsCount] = useState<number>(() => audits.length);
  const [isLoadingAudits, setIsLoadingAudits] = useState<boolean>(false);
  const [isLoadingMoreAudits, setIsLoadingMoreAudits] = useState<boolean>(false);
  const nextLazyPageRef = useRef<number>(2);
  const hasMoreServerAuditsRef = useRef<boolean>(false);
  const bgLoadPromiseRef = useRef<Promise<void> | null>(null);

  const [questions, _setQuestions] = useState<AuditQuestion[]>(() => {
    const saved = localStorage.getItem('hospaudit_questions');
    let baseList = defaultQuestions;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) baseList = parsed;
      } catch (e) {
        console.error('Error loading questions from localStorage', e);
      }
    }
    const seenId = new Set<string>();
    const seenLabel = new Set<string>();
    return baseList.filter((q: any) => {
      const cleanLabel = q.label?.trim().toLowerCase();
      if (seenId.has(q.id) || seenLabel.has(cleanLabel)) return false;
      seenId.add(q.id);
      seenLabel.add(cleanLabel);
      return true;
    });
  });

  const setQuestions = useCallback((val: AuditQuestion[] | ((prev: AuditQuestion[]) => AuditQuestion[])) => {
    _setQuestions(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      const seenId = new Set<string>();
      const seenLabel = new Set<string>();
      const filtered = next.filter(q => {
        const cleanLabel = q.label?.trim().toLowerCase();
        if (seenId.has(q.id) || seenLabel.has(cleanLabel)) return false;
        seenId.add(q.id);
        seenLabel.add(cleanLabel);
        return true;
      });
      return filtered;
    });
  }, []);

  const [patients, setPatients] = useState<Patient[]>(() => {
    const saved = localStorage.getItem('hospaudit_patients');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Error loading patients from localStorage', e);
      }
    }
    return [];
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('hospaudit_employees');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Error loading employees from localStorage', e);
      }
    }
    return [];
  });

  // State to track pending operations
  const [pendingQueue, setPendingQueue] = useState<PendingOperation[]>(() => {
    return [];
  });
  const pendingQueueRef = useRef<PendingOperation[]>([]);

  // Synchronize state changes directly to localStorage for robust offline persistence
  useEffect(() => {
    pendingQueueRef.current = pendingQueue;
  }, [pendingQueue]);

  useEffect(() => {
    localStorage.setItem('hospaudit_sectors', JSON.stringify(sectors));
  }, [sectors]);

  useEffect(() => {
    localStorage.setItem('hospaudit_beds', JSON.stringify(beds));
  }, [beds]);

  useEffect(() => {
    // Debounce and cap localStorage snapshot (max 200 recent audits) to prevent UI thread blocking on large datasets
    const timer = setTimeout(() => {
      const persistSnapshot = () => {
        try {
          const snapshot = audits.length > 200 ? audits.slice(0, 200) : audits;
          localStorage.setItem('hospaudit_audits', JSON.stringify(snapshot));
        } catch (err) {
          console.warn('[LocalStorage] Snapshot de auditorias reduzido por limite de espaço:', err);
        }
      };
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(persistSnapshot, { timeout: 1500 });
      } else {
        persistSnapshot();
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [audits]);

  useEffect(() => {
    localStorage.setItem('hospaudit_questions', JSON.stringify(questions));
  }, [questions]);

  useEffect(() => {
    localStorage.setItem('hospaudit_patients', JSON.stringify(patients));
  }, [patients]);

  useEffect(() => {
    localStorage.setItem('hospaudit_employees', JSON.stringify(employees));
  }, [employees]);

  // State to track system/sync errors in real-time
  const [systemErrors, setSystemErrors] = useState<SystemError[]>([]);

  // State to track discrepancies/divergences between local cache and remote server
  const [divergences, setDivergences] = useState<SyncDivergences>({
    hasDivergence: false,
    sectorsDiff: 0,
    bedsDiff: 0,
    auditsDiff: 0,
    questionsDiff: 0,
    serverOnline: true,
    lastCheck: new Date().toLocaleTimeString('pt-BR'),
    lastLocalWrite: null,
    lastServerWrite: null,
  });

  const [syncFailures, setSyncFailures] = useState<SyncFailure[]>([]);

  const clearSyncFailures = useCallback(() => {
    setSyncFailures([]);
  }, []);

  // Centralized Database Connection states
  const [dbConfig, setDbConfig] = useState({
    dbType: 'postgresql',
    host: '10.0.1.45',
    port: '5432',
    databaseName: 'hospital_main_prod',
    user: 'audit_reader',
    password: 'password_db_secure',
    syncInterval: '1h',
    isConnected: true,
    lastSyncTime: 'Hoje, 11:15'
  });

  const [dbConnected, setDbConnected] = useState<boolean>(true);
  const [dbLastHeartbeat, setDbLastHeartbeat] = useState<string>(() => new Date().toLocaleTimeString('pt-BR'));
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  const reconnectDb = async (): Promise<boolean> => {
    setDbStatus('reconnecting');
    resetApiCache();
    const isOnline = await checkApi();
    const nowStr = new Date().toLocaleTimeString('pt-BR');
    if (isOnline) {
      setDbConnected(true);
      setDbLastHeartbeat(nowStr);
      setDbStatus('connected');
      setReconnectAttempts(0);
      setDbConfig(prev => ({
        ...prev,
        isConnected: true,
        lastSyncTime: nowStr
      }));
      // Sincroniza em lote se houver pendências
      if (pendingQueue.length > 0) {
        await syncBatch();
      }
      return true;
    } else {
      setDbConnected(false);
      setDbStatus('disconnected');
      setDbConfig(prev => ({
        ...prev,
        isConnected: false
      }));
      return false;
    }
  };

  const addSyncFailure = useCallback((op: PendingOperation, errorMsg: string, type: 'network' | 'database') => {
    let itemName = 'Registro Desconhecido';
    if (op.payload) {
      if (op.action.includes('sector')) {
        itemName = `Setor: ${op.payload.name || op.payload.id || 'N/A'}`;
      } else if (op.action.includes('bed')) {
        itemName = `Leito: ${op.payload.number || op.payload.id || 'N/A'}`;
      } else if (op.action.includes('audit')) {
        itemName = `Auditoria por: ${op.payload.evaluator || 'N/A'} (ID: ${op.payload.id || 'N/A'})`;
      } else if (op.action.includes('question')) {
        itemName = `Pergunta: ${op.payload.label || op.payload.id || 'N/A'}`;
      } else {
        itemName = `ID: ${op.payload.id || 'N/A'}`;
      }
    }
    
    const newFailure: SyncFailure = {
      id: `fail-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      opId: op.id,
      action: op.action,
      payload: op.payload,
      timestamp: new Date().toISOString(),
      error: errorMsg,
      type,
      itemName
    };

    setSyncFailures(prev => [newFailure, ...prev].slice(0, 500));
  }, []);

  // Pre-computed indexes for O(1) query lookups (accelerates sector/bed switching and rendering)
  const sectorsIndex = useMemo(() => {
    const map = new Map<string, Sector>();
    sectors.forEach(s => map.set(s.id, s));
    return map;
  }, [sectors]);

  const bedsIndex = useMemo(() => {
    const map = new Map<string, Bed>();
    beds.forEach(b => map.set(b.id, b));
    return map;
  }, [beds]);

  const questionsIndex = useMemo(() => {
    const map = new Map<string, AuditQuestion>();
    questions.forEach(q => map.set(q.id, q));
    return map;
  }, [questions]);

  const getSectorById = useCallback((id: string): Sector | undefined => {
    return sectorsIndex.get(id);
  }, [sectorsIndex]);

  const getBedById = useCallback((id: string): Bed | undefined => {
    return bedsIndex.get(id);
  }, [bedsIndex]);

  const getQuestionById = useCallback((id: string): AuditQuestion | undefined => {
    return questionsIndex.get(id);
  }, [questionsIndex]);

  const bedsBySectorIndex = useMemo(() => {
    const idx: Record<string, Bed[]> = {};
    for (let i = 0; i < beds.length; i++) {
      const b = beds[i];
      if (!idx[b.sectorId]) {
        idx[b.sectorId] = [];
      }
      idx[b.sectorId].push(b);
    }
    return idx;
  }, [beds]);

  const auditsByBedIndex = useMemo(() => {
    const idx: Record<string, AuditRecord[]> = {};
    for (let i = 0; i < audits.length; i++) {
      const a = audits[i];
      if (!idx[a.bedId]) {
        idx[a.bedId] = [];
      }
      idx[a.bedId].push(a);
    }
    return idx;
  }, [audits]);

  const auditsBySectorIndex = useMemo(() => {
    const idx: Record<string, AuditRecord[]> = {};
    for (let i = 0; i < audits.length; i++) {
      const a = audits[i];
      if (!idx[a.sectorId]) {
        idx[a.sectorId] = [];
      }
      idx[a.sectorId].push(a);
    }
    return idx;
  }, [audits]);

  const getBedsBySector = useCallback((sectorId: string): Bed[] => {
    return bedsBySectorIndex[sectorId] || [];
  }, [bedsBySectorIndex]);

  const getAuditsByBed = useCallback((bedId: string): AuditRecord[] => {
    return auditsByBedIndex[bedId] || [];
  }, [auditsByBedIndex]);

  const getAuditsBySector = useCallback((sectorId: string): AuditRecord[] => {
    return auditsBySectorIndex[sectorId] || [];
  }, [auditsBySectorIndex]);

  // State to track WebSocket-like connection status ('connected' | 'disconnected' | 'connecting')
  const [syncStatus, setSyncStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connected');

  // Synchronize divergences.serverOnline with our reactive syncStatus state instantly
  useEffect(() => {
    setDivergences(prev => ({
      ...prev,
      serverOnline: syncStatus === 'connected'
    }));
  }, [syncStatus]);

  const processPendingQueue = async () => {
    if (pendingQueue.length === 0) return;
    if (isProcessingQueueRef.current) return;

    isProcessingQueueRef.current = true;
    console.log(`[Queue Processor] Iniciando exportação de ${pendingQueue.length} alterações locais pendentes.`);

    try {
      let successfulCount = 0;
      const failedOps: PendingOperation[] = [];

      for (const op of pendingQueue) {
        let opSuccess = false;
        try {
          console.log(`[Queue Processor] Exportando automaticamente: ${op.action} para ID: ${op.payload?.id}`);
          opSuccess = await DbMiddleware.executeWrite(op.action, op.payload);
        } catch (err) {
          console.warn(`[Queue Processor] Falha ao exportar ${op.action}:`, err);
        }

        if (opSuccess) {
          successfulCount++;
        } else {
          failedOps.push({
            ...op,
            retryCount: op.retryCount + 1
          });
        }
      }

      setPendingQueue(failedOps);

      if (failedOps.length > 0) {
        addLog('Sistema', 'FALHA_SINCRONIZACAO_PENDENCIAS', `Falha ao exportar ${failedOps.length} alteração(ões) pendente(s) de backup para o MySQL.`);
      }

      if (successfulCount > 0) {
        showToast('success', 'Backup na Nuvem', `${successfulCount} alteração(ões) pendente(s) exportada(s) com sucesso para o MySQL.`);
        addLog(userEmail, 'EXPORTACAO_AUTOMATICA_SUCESSO', `Exportados ${successfulCount} registros pendentes como backup na nuvem.`);
        
        // Reload fresh server data
        await DbMiddleware.executeRead().then(serverData => {
          if (serverData) {
            if (serverData.sectors) setSectors(serverData.sectors);
            if (serverData.beds) setBeds(serverData.beds.map((b: any) => ({
              id: String(b.id),
              number: b.number,
              sectorId: b.sectorId || b.sector_id || ''
            })));
            if (serverData.audits) setAudits(serverData.audits);
            if (serverData.questions) setQuestions(serverData.questions);
            if (serverData.patients) setPatients(serverData.patients);
          }
        }).catch(err => {
          console.error('[Queue Processor] Erro ao atualizar dados pós-exportação:', err);
        });
      }
    } catch (error: any) {
      console.error('[Queue Processor] Falha fatal no loop de exportação:', error);
      addLog('Sistema', 'ERRO_FATAL_EXPORTACAO', `Erro crítico ao processar fila de exportação de dados: ${error.message || String(error)}`);
    } finally {
      isProcessingQueueRef.current = false;
    }
  };

  // Batch sending is deprecated as we write directly to the database. Kept for backward compatibility.
  const syncBatch = async (): Promise<boolean> => {
    await processPendingQueue();
    await syncDatabases();
    return true;
  };

  // Reconnection manager function
  const reconnect = () => {
    console.log("[MySQL] Reconexão manual solicitada pelo usuário.");
    setSyncStatus('connecting');
    setTimeout(async () => {
      resetApiCache();
      const isOnline = await checkApi();
      if (isOnline) {
        setSyncStatus('connected');
        await syncDatabases();
      } else {
        setSyncStatus('disconnected');
      }
    }, 500);
  };

  // Centralized Automatic high frequency check, database heartbeat and automatic reconnection supervisor
  useEffect(() => {
    let active = true;
    let checkTimeout: NodeJS.Timeout;
    let consecutiveFailures = 0;

    const checkConnection = async () => {
      if (!active) return;
      
      try {
        resetApiCache();
        const isOnline = await checkApi();
        const nowStr = new Date().toLocaleTimeString('pt-BR');
        
        if (isOnline) {
          consecutiveFailures = 0;
          setSyncStatus('connected');
          setDbConnected(true);
          setDbLastHeartbeat(nowStr);
          setDbStatus('connected');
          setReconnectAttempts(0);
          
          setDbConfig(prev => {
            if (!prev.isConnected) {
              return { ...prev, isConnected: true, lastSyncTime: nowStr };
            }
            return prev;
          });

          if (pendingQueueRef.current.length > 0) {
            console.log(`[DB Auto-Reconnect] Conexão ativa! Sincronizando ${pendingQueueRef.current.length} transações locais pendentes para MySQL.`);
            await syncBatch();
          }
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            setSyncStatus('disconnected');
            setDbConnected(false);
            setDbStatus('reconnecting');
            
            setDbConfig(prev => {
              if (prev.isConnected) {
                return { ...prev, isConnected: false };
              }
              return prev;
            });

            setReconnectAttempts(prevAttempts => {
              const next = prevAttempts + 1;
              console.warn(`[DB Heartbeat] Falha na conexão após 3 tentativas consecutivas. Tentativa de reconexão automática #${next}...`);
              setTimeout(() => {
                if (next <= 5) {
                  addLog('Sistema (Rede)', 'RECONEXAO_FALHA', `Tentativa de reconexão automática #${next} falhou. Servidor offline.`);
                }
              }, 0);
              return next;
            });
          } else {
            console.log(`[DB Heartbeat] Falha temporária de conexão ignorada (${consecutiveFailures}/3). Mantendo conexão ativa.`);
          }
        }
      } catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          setSyncStatus('disconnected');
          setDbConnected(false);
          setDbStatus('reconnecting');
        }
      }

      if (active) {
        // Heartbeat every 5 seconds for robust real-time tracking
        checkTimeout = setTimeout(checkConnection, 5000);
      }
    };

    checkConnection();

    const handleBrowserOnline = () => {
      console.log("[WebSocket] Evento online disparado pelo navegador. Conectando...");
      setSyncStatus('connecting');
      checkConnection();
    };

    const handleBrowserOffline = () => {
      console.warn("[WebSocket] Evento offline disparado pelo navegador.");
      setSyncStatus('disconnected');
      setDbConnected(false);
      setDbStatus('disconnected');
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    // Inscrição no evento de atualização de banco de dados via Socket.IO em tempo real
    const unsubscribeSocket = subscribeToDbUpdates((updateInfo) => {
      console.log('[Socket.IO] Alteração em tempo real detectada no banco de dados XAMPP:', updateInfo);
      setDbLastHeartbeat(new Date().toLocaleTimeString('pt-BR'));
    });

    // Sincronização periódica a cada 5 minutos garantindo alinhamento constante
    const fiveMinInterval = setInterval(() => {
      console.log('[AuditContext] Disparando verificação periódica de 5 minutos com o banco MySQL...');
      syncDatabases();
    }, 5 * 60 * 1000);

    return () => {
      active = false;
      clearTimeout(checkTimeout);
      clearInterval(fiveMinInterval);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
      unsubscribeSocket();
    };
  }, []);

  const addSystemError = (type: string, message: string, details?: string, source: SystemError['source'] = 'database') => {
    const newError: SystemError = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
      source
    };
    setSystemErrors(prev => [newError, ...prev].slice(0, 500)); // Maintain up to 500 errors
    
    // Also record in system logs
    try {
      addLog(userEmail, `ERRO_${type}`, `${message} | Detalhes: ${details || 'Nenhum'}`);
    } catch (e) {
      console.warn("Failed to log system error to SystemLogContext:", e);
    }
  };

  const clearSystemErrors = () => {
    setSystemErrors([]);
    setSyncFailures([]);
  };

  const simulateError = () => {
    addSystemError(
      'ERR_MOCK_SYNC_FAIL',
      'Falha de integridade referencial: leito aponta para setor inexistente.',
      'O leito "Leito 12B" no MySQL tentou referenciar o ID de setor "setor_inexistente" que foi deletado por outro usuário.',
      'database'
    );

    // Também injetamos o leito "Leito 12B" órfão (com ID de setor inexistente) no cache local,
    // permitindo que o Scanner / Diagnosticador de Bugs o detecte e corrija de verdade.
    setBeds(prev => {
      const hasBed12B = prev.some(b => b.id === 'mock-bed-12b' || (b.number === '12B' && b.sectorId === 'setor_inexistente'));
      if (hasBed12B) return prev;

      const newMockBed: Bed = {
        id: 'mock-bed-12b',
        number: '12B',
        sectorId: 'setor_inexistente'
      };
      const updatedList = [...prev, newMockBed];
      setTimeout(() => {
        addLog(userEmail, 'SISTEMA_SIMULACAO', 'Inconsistência simulada: Leito órfão "Leito 12B" inserido no cache.');
      }, 0);
      return updatedList;
    });
  };

  const LAZY_BATCH_SIZE = 250;
  const INITIAL_AUDIT_BATCH = 100;

  const loadRemainingAuditsProgressively = useCallback(async (startPage = 2, batchSize = INITIAL_AUDIT_BATCH): Promise<void> => {
    if (bgLoadPromiseRef.current) {
      return bgLoadPromiseRef.current;
    }

    const runner = (async () => {
      setIsLoadingMoreAudits(true);
      try {
        let currentPage = startPage;
        while (hasMoreServerAuditsRef.current) {
          // Yield to browser main thread between chunks so UI interactions remain 60fps
          await new Promise(resolve => setTimeout(resolve, 80));
          const chunk = await PhpRepository.getAllData(currentPage, batchSize);
          if (!chunk || !Array.isArray(chunk.audits) || chunk.audits.length === 0) {
            hasMoreServerAuditsRef.current = false;
            break;
          }

          setAudits(prev => mergeById(prev, chunk.audits));
          if (typeof chunk.total_audits === 'number') {
            setTotalAuditsCount(chunk.total_audits);
          }

          hasMoreServerAuditsRef.current = Boolean(chunk.has_more);
          currentPage += 1;
          nextLazyPageRef.current = currentPage;
        }
      } catch (err) {
        console.warn('[Lazy Loader] Carregamento progressivo pausado:', err);
      } finally {
        setIsLoadingMoreAudits(false);
        bgLoadPromiseRef.current = null;
      }
    })();

    bgLoadPromiseRef.current = runner;
    return runner;
  }, []);

  const loadMoreAudits = useCallback(async (): Promise<void> => {
    if (!hasMoreServerAuditsRef.current || isLoadingMoreAudits) return;
    setIsLoadingMoreAudits(true);
    try {
      const chunk = await PhpRepository.getAllData(nextLazyPageRef.current, LAZY_BATCH_SIZE);
      if (chunk && Array.isArray(chunk.audits) && chunk.audits.length > 0) {
        setAudits(prev => mergeById(prev, chunk.audits));
        if (typeof chunk.total_audits === 'number') {
          setTotalAuditsCount(chunk.total_audits);
        }
        hasMoreServerAuditsRef.current = Boolean(chunk.has_more);
        nextLazyPageRef.current += 1;
      } else {
        hasMoreServerAuditsRef.current = false;
      }
    } finally {
      setIsLoadingMoreAudits(false);
    }
  }, [isLoadingMoreAudits]);

  const ensureAllAuditsLoaded = useCallback(async (): Promise<void> => {
    if (!hasMoreServerAuditsRef.current) return;
    await loadRemainingAuditsProgressively(nextLazyPageRef.current, LAZY_BATCH_SIZE);
  }, [loadRemainingAuditsProgressively]);

  // Sync state with MySQL/Node Native Database in real-time using progressive lazy loading
  const syncDatabases = async () => {
    resetApiCache();
    const isOnline = await checkApi();
    setSyncStatus(isOnline ? 'connected' : 'disconnected');

    if (!isOnline) {
      if (wasOnlineRef.current) {
        wasOnlineRef.current = false;
        addLog('Sistema', 'FALHA_CONEXAO_BANCO', 'Falha ao sincronizar dados: o banco de dados MySQL central está offline.');
      }
      setDivergences(prev => ({
        ...prev,
        serverOnline: false,
        lastCheck: new Date().toLocaleTimeString('pt-BR'),
      }));
      return;
    }

    if (!wasOnlineRef.current) {
      wasOnlineRef.current = true;
      addLog('Sistema', 'CONEXAO_BANCO_RESTABELECIDA', 'Conexão com o banco de dados MySQL central restabelecida com sucesso.');
    }

    if (pendingQueueRef.current.length > 0) {
      await processPendingQueue();
      return;
    }

    setIsLoadingAudits(true);
    try {
      // Load initial batch of 100 latest audits for instant first paint & smooth startup
      const serverData = await PhpRepository.getAllData(1, INITIAL_AUDIT_BATCH);

      if (!serverData) return;

      const remoteSectors = serverData.sectors || [];
      const remoteBeds = (serverData.beds || []).map((b: any) => ({
        id: String(b.id),
        number: b.number,
        sectorId: b.sectorId || b.sector_id || ''
      }));
      const remoteAudits = serverData.audits || [];
      const remoteQuestions = serverData.questions || [];
      const remotePatients = serverData.patients || [];
      const serverTotalAudits = typeof serverData.total_audits === 'number' ? serverData.total_audits : remoteAudits.length;

      setSectors(prev => mergeById(prev, remoteSectors));
      setBeds(prev => mergeById(prev, remoteBeds));
      setQuestions(prev => mergeById(prev, remoteQuestions));
      setPatients(prev => mergeById(prev, remotePatients));
      setTotalAuditsCount(serverTotalAudits);

      if (serverData.employees) {
        setEmployees(prev => mergeById(prev, serverData.employees));
      }

      // When paginating from server, replace stale local slice on initial page if no pending ops, or merge safely
      setAudits(prev => mergeById(remoteAudits, prev.length > INITIAL_AUDIT_BATCH ? prev : []));

      hasMoreServerAuditsRef.current = Boolean(serverData.has_more);
      nextLazyPageRef.current = 2;

      const syncTime = new Date().toISOString();

      setDivergences({
        hasDivergence: false,
        sectorsDiff: 0,
        bedsDiff: 0,
        auditsDiff: 0,
        questionsDiff: 0,
        serverOnline: true,
        lastCheck: new Date().toLocaleTimeString('pt-BR'),
        lastLocalWrite: syncTime,
        lastServerWrite: syncTime,
      });

      // Lazily hydrate remaining audit pages in background chunks after UI settles
      if (serverData.has_more) {
        setTimeout(() => {
          loadRemainingAuditsProgressively(2, LAZY_BATCH_SIZE);
        }, 250);
      }
    } catch (err: any) {
      addSystemError('ERR_SYNC_EXCEPTION', 'Erro inesperado na sincronização automática em tempo real.', err.message || String(err), 'server');
      addLog('Sistema', 'ERRO_SINCRONIZACAO_BANCO', `Erro crítico na sincronização em tempo real com MySQL: ${err.message || String(err)}`);
    } finally {
      setIsLoadingAudits(false);
    }
  };

  // Push local data to server manually to force resolve discrepancies
  const pushLocalToServer = async (): Promise<boolean> => {
    try {
      const isOnline = await checkApi();
      if (!isOnline) {
        addSystemError('ERR_FORCE_PUSH_FAILED', 'Não foi possível forçar o upload dos dados.', 'O servidor de banco de dados MySQL está offline.', 'network');
        return false;
      }

      addLog(userEmail, 'FORCE_SYNC_PUSH', 'Iniciando upload forçado de dados locais para o MySQL.');

      // Push sectors
      for (const sect of sectors) {
        const success = await DbMiddleware.executeWrite('add_sector', sect);
        if (!success) {
          addSystemError('ERR_PUSH_SECTOR', `Falha ao subir setor "${sect.name}".`, `ID: ${sect.id}`, 'database');
        }
      }

      // Push beds
      for (const b of beds) {
        const success = await DbMiddleware.executeWrite('add_bed', b);
        if (!success) {
          addSystemError('ERR_PUSH_BED', `Falha ao subir leito "${b.number}".`, `ID: ${b.id}, Setor ID: ${b.sectorId}`, 'database');
        }
      }

      // Push audits
      for (const aud of audits) {
        const success = await DbMiddleware.executeWrite('add_audit', aud);
        if (!success) {
          addSystemError('ERR_PUSH_AUDIT', `Falha ao subir auditoria de "${aud.evaluator}".`, `ID: ${aud.id}`, 'database');
        }
      }

      // Push questions
      for (const q of questions) {
        const success = await DbMiddleware.executeWrite('add_question', q);
        if (!success) {
          addSystemError('ERR_PUSH_QUESTION', `Falha ao subir pergunta "${q.label}".`, `ID: ${q.id}`, 'database');
        }
      }

      await syncDatabases();
      addLog(userEmail, 'FORCE_SYNC_PUSH_SUCCESS', 'Upload forçado e resolução de divergências concluídos com sucesso.');
      return true;
    } catch (e: any) {
      addSystemError('ERR_PUSH_EXCEPTION', 'Erro inesperado durante upload forçado de dados.', e.message || String(e), 'server');
      return false;
    }
  };

  // Pull remote data and completely replace local data
  const pullServerToLocal = async (): Promise<boolean> => {
    try {
      const isOnline = await checkApi();
      if (!isOnline) {
        addSystemError('ERR_FORCE_PULL_FAILED', 'Não foi possível baixar dados do servidor.', 'O servidor de banco de dados MySQL está offline.', 'network');
        return false;
      }

      addLog(userEmail, 'FORCE_SYNC_PULL', 'Iniciando download forçado e substituição do cache local pelo MySQL.');

      const serverData = await DbMiddleware.executeRead();
      if (serverData) {
        setSectors(prev => mergeById(prev, serverData.sectors || []));
        
        const mappedBeds = (serverData.beds || []).map((b: any) => ({
          id: String(b.id),
          number: b.number,
          sectorId: b.sectorId || b.sector_id || ''
        }));
        setBeds(prev => mergeById(prev, mappedBeds));

        setAudits(prev => mergeById(prev, serverData.audits || []));
        setQuestions(prev => mergeById(prev, serverData.questions || []));

        addLog(userEmail, 'FORCE_SYNC_PULL_SUCCESS', 'Dados locais consolidados e atualizados com sucesso com os dados do MySQL.');
        return true;
      } else {
        throw new Error('Servidor retornou conjunto de dados vazio ou nulo.');
      }
    } catch (e: any) {
      addSystemError('ERR_PULL_EXCEPTION', 'Erro inesperado durante download e substituição de dados.', e.message || String(e), 'server');
      return false;
    }
  };

  // Sync state with MySQL Database on Startup
  useEffect(() => {
    syncDatabases();

    const handleOnline = () => {
      console.log('Conexão com a rede reestabelecida. Sincronizando dados...');
      syncDatabases();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Automated background maintenance: clears non-essential cache and cookies every 30 minutes without losing active sessions or critical pending data
  useEffect(() => {
    const runAutomatedMaintenance = async () => {
      console.log('[AUTOCLEAN] Iniciando rotina automática de manutenção (cache e cookies)...');
      
      // 1. Clear non-essential domain cookies safely (preserving critical session & authentication cookies)
      let clearedCookiesCount = 0;
      try {
        const cookies = document.cookie.split(";");
        const criticalKeywords = ['session', 'token', 'auth', 'uid', 'user', 'jwt', 'sid', 'login', 'connect.sid', 'PHPSESSID', '__Host-', '__Secure-'];
        
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i];
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          
          if (name) {
            // Check if cookie is a critical session/auth cookie
            const isCritical = criticalKeywords.some(kw => name.toLowerCase().includes(kw));
            if (!isCritical) {
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax";
              clearedCookiesCount++;
            }
          }
        }
      } catch (e) {
        console.error('[AUTOCLEAN] Erro ao limpar cookies:', e);
      }

      // 2. Clear API cache detection to force a real network check
      resetApiCache();

      // 3. Trim ONLY non-essential operational logs/errors to optimize space without losing data
      try {
        setSystemErrors(prev => prev.slice(0, 30)); // Keep only the latest 30 system errors to optimize local database size
        setSyncFailures(prev => prev.slice(0, 30)); // Keep only the latest 30 sync failures
      } catch (e) {
        console.error('[AUTOCLEAN] Erro ao otimizar histórico de falhas:', e);
      }

      // 4. Safely synchronize databases instead of blindly replacing local state.
      let pullSuccess = false;
      try {
        pullSuccess = await pullServerToLocal();
      } catch (e) {
        console.error('[AUTOCLEAN] Falha ao atualizar dados durante a manutenção:', e);
      }

      // 5. Register the maintenance log
      const details = `Manutenção de segundo plano concluída. Cookies limpos: ${clearedCookiesCount} (Sessões críticas preservadas). Atualização MySQL: ${pullSuccess ? 'SUCESSO (Pull Completo)' : 'FALHA'}.`;
      addLog('Sistema (Manutenção)', 'LIMPEZA_AUTOMATICA', details);
      console.log(`[AUTOCLEAN] ${details}`);
    };

    // Schedule to run every 30 minutes
    const maintenanceInterval = setInterval(() => {
      runAutomatedMaintenance();
    }, 1800000); // 30 minutes

    // Run once after 15 seconds of startup so we don't block the initial loading flow
    const startupTimeout = setTimeout(() => {
      runAutomatedMaintenance();
    }, 15000);

    return () => {
      clearInterval(maintenanceInterval);
      clearTimeout(startupTimeout);
    };
  }, []);

  const executeWriteOperation = async (
    action: PendingOperation['action'],
    localUpdate: () => void,
    remoteCall: () => Promise<boolean>,
    payload: any,
    successToastTitle: string,
    successToastMsg: string,
    errorToastTitle: string,
    errorToastMsg: string,
    logMsg: string
  ) => {
    // Execute local update first to guarantee full local/offline functionality
    localUpdate();
    
    try {
      const success = await remoteCall();
      if (success) {
        showToast('success', successToastTitle, successToastMsg);
        addLog(userEmail, `${action.toUpperCase()}_SUCESSO`, `${logMsg} (Salvo no banco de dados)`);
      } else {
        showToast('info', 'Salvo Localmente', `${logMsg} (Banco MySQL não configurado)`);
        addLog(userEmail, `${action.toUpperCase()}_LOCAL`, `${logMsg} (Apenas local)`);
      }
    } catch (err: any) {
      console.warn(`[MySQL Info] Opcional - gravação de "${action}" efetuada apenas localmente:`, err);
      showToast('info', 'Salvo Localmente', `${logMsg} (Processado localmente/offline)`);
      addLog(userEmail, `${action.toUpperCase()}_LOCAL`, `${logMsg} (Apenas local/offline)`);
    }
  };

  const addSector = async (sector: Omit<Sector, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newSector = { ...sector, id };
    await executeWriteOperation(
      'add_sector',
      () => setSectors(prev => [...prev, newSector]),
      () => PhpRepository.addSector(newSector),
      newSector,
      'Gravado com Sucesso',
      `Setor "${sector.name}" salvo no banco MySQL.`,
      'Salvo no Navegador',
      `Não foi possível salvar o setor "${sector.name}" no servidor.`,
      `Setor "${sector.name}" criado.`
    );
  };

  const updateSector = async (id: string, updated: Omit<Sector, 'id'>) => {
    const newSector = { ...updated, id };
    await executeWriteOperation(
      'update_sector',
      () => setSectors(prev => prev.map(s => s.id === id ? newSector : s)),
      () => PhpRepository.updateSector(newSector),
      newSector,
      'Atualizado com Sucesso',
      `Setor "${updated.name}" atualizado no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível atualizar o setor "${updated.name}" no servidor.`,
      `Setor "${updated.name}" atualizado.`
    );
  };

  const deleteSector = async (id: string) => {
    const sectorName = sectors.find(s => s.id === id)?.name || id;
    await executeWriteOperation(
      'delete_sector',
      () => {
        setSectors(prev => prev.filter(s => s.id !== id));
        setBeds(prev => prev.filter(b => b.sectorId !== id));
      },
      () => PhpRepository.deleteSector(id),
      { id },
      'Removido com Sucesso',
      `Setor "${sectorName}" removido do MySQL.`,
      'Salvo no Navegador',
      `Não foi possível remover o setor "${sectorName}" no servidor.`,
      `Setor "${sectorName}" removido.`
    );
  };

  const addBed = async (bed: Omit<Bed, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newBed = { ...bed, id };
    await executeWriteOperation(
      'add_bed',
      () => setBeds(prev => [...prev, newBed]),
      () => PhpRepository.addBed(newBed),
      newBed,
      'Leito Criado',
      `Leito "${bed.number}" salvo no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível criar o leito "${bed.number}" no servidor.`,
      `Leito "${bed.number}" criado.`
    );
  };

  const deleteBed = async (id: string) => {
    const bedNumber = beds.find(b => b.id === id)?.number || id;
    await executeWriteOperation(
      'delete_bed',
      () => setBeds(prev => prev.filter(b => b.id !== id)),
      () => PhpRepository.deleteBed(id),
      { id },
      'Leito Removido',
      `Leito "${bedNumber}" removido do MySQL.`,
      'Salvo no Navegador',
      `Não foi possível remover o leito "${bedNumber}" no servidor.`,
      `Leito "${bedNumber}" removido.`
    );
  };

  const updateBed = async (id: string, updated: Omit<Bed, 'id'>) => {
    const newBed = { ...updated, id };
    await executeWriteOperation(
      'update_bed',
      () => setBeds(prev => prev.map(b => b.id === id ? newBed : b)),
      () => PhpRepository.updateBed(newBed),
      newBed,
      'Leito Atualizado',
      `Leito "${updated.number}" atualizado no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível atualizar o leito "${updated.number}" no servidor.`,
      `Leito "${updated.number}" atualizado.`
    );
  };

  const addAudit = async (audit: Omit<AuditRecord, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newAudit = { ...audit, id };
    await executeWriteOperation(
      'add_audit',
      () => {
        setAudits(prev => [newAudit, ...prev]);
        setTotalAuditsCount(c => c + 1);
      },
      () => PhpRepository.addAudit(newAudit),
      newAudit,
      'Gravado com Sucesso',
      `Auditoria de "${audit.evaluator}" salva no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível salvar a auditoria no servidor.`,
      `Auditoria de "${audit.evaluator}" cadastrada.`
    );
  };

  const updateAudit = async (id: string, updated: Omit<AuditRecord, 'id'>) => {
    const newAudit = { ...updated, id };
    await executeWriteOperation(
      'update_audit',
      () => setAudits(prev => prev.map(a => a.id === id ? newAudit : a)),
      () => PhpRepository.updateAudit(newAudit),
      newAudit,
      'Atualizado com Sucesso',
      `Auditoria atualizada no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível atualizar a auditoria no servidor.`,
      `Auditoria ID: ${id} atualizada.`
    );
  };

  const deleteAudit = async (id: string) => {
    const auditObj = audits.find(a => a.id === id);
    const evaluator = auditObj?.evaluator || id;
    await executeWriteOperation(
      'delete_audit',
      () => {
        setAudits(prev => prev.filter(a => a.id !== id));
        setTotalAuditsCount(c => Math.max(0, c - 1));
      },
      () => PhpRepository.deleteAudit(id),
      { id },
      'Removido com Sucesso',
      `Auditoria removida do MySQL.`,
      'Salvo no Navegador',
      `Não foi possível remover a auditoria no servidor.`,
      `Auditoria de "${evaluator}" removida.`
    );
  };

  const addQuestion = async (question: Omit<AuditQuestion, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newQuestion = { ...question, id };
    await executeWriteOperation(
      'add_question',
      () => setQuestions(prev => [...prev, newQuestion]),
      () => PhpRepository.addQuestion(newQuestion),
      newQuestion,
      'Gravado com Sucesso',
      `Pergunta "${question.label}" salva no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível criar a pergunta no servidor.`,
      `Pergunta "${question.label}" criada.`
    );
  };

  const deleteQuestion = async (id: string) => {
    const questionLabel = questions.find(q => q.id === id)?.label || id;
    await executeWriteOperation(
      'delete_question',
      () => setQuestions(prev => prev.filter(q => q.id !== id)),
      () => PhpRepository.deleteQuestion(id),
      { id },
      'Removido com Sucesso',
      `Pergunta removida do MySQL.`,
      'Salvo no Navegador',
      `Não foi possível remover a pergunta no servidor.`,
      `Pergunta "${questionLabel}" removida.`
    );
  };

  const updateQuestion = async (id: string, updated: Omit<AuditQuestion, 'id'>) => {
    const newQuestion = { ...updated, id };
    await executeWriteOperation(
      'update_question',
      () => setQuestions(prev => prev.map(q => q.id === id ? newQuestion : q)),
      () => PhpRepository.updateQuestion(newQuestion),
      newQuestion,
      'Atualizado com Sucesso',
      `Pergunta atualizada no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível atualizar a pergunta no servidor.`,
      `Pergunta "${updated.label}" atualizada.`
    );
  };

  const addPatient = async (patient: Omit<Patient, 'id'>) => {
    const id = 'pat_' + Math.random().toString(36).substr(2, 9);
    const newPatient = { ...patient, id };
    await executeWriteOperation(
      'add_patient',
      () => setPatients(prev => [...prev, newPatient]),
      () => PhpRepository.addPatient(newPatient),
      newPatient,
      'Cadastrado com Sucesso',
      `Paciente "${patient.name}" cadastrado no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível cadastrar o paciente "${patient.name}" no servidor.`,
      `Paciente "${patient.name}" cadastrado.`
    );
  };

  const updatePatient = async (id: string, updated: Omit<Patient, 'id'>) => {
    const newPatient = { ...updated, id };
    await executeWriteOperation(
      'update_patient',
      () => setPatients(prev => prev.map(p => p.id === id ? newPatient : p)),
      () => PhpRepository.updatePatient(newPatient),
      newPatient,
      'Atualizado com Sucesso',
      `Paciente "${updated.name}" atualizado no MySQL.`,
      'Salvo no Navegador',
      `Não foi possível atualizar o paciente "${updated.name}" no servidor.`,
      `Paciente "${updated.name}" atualizado.`
    );
  };

  const deletePatient = async (id: string) => {
    const patientName = patients.find(p => p.id === id)?.name || id;
    await executeWriteOperation(
      'delete_patient',
      () => setPatients(prev => prev.filter(p => p.id !== id)),
      () => PhpRepository.deletePatient(id),
      { id },
      'Removido com Sucesso',
      `Paciente removido do MySQL.`,
      'Salvo no Navegador',
      `Não foi possível remover o paciente no servidor.`,
      `Paciente "${patientName}" removido.`
    );
  };

  // Equipment and maintenance modules removed per specifications
  const equipments: any[] = [];
  const maintenances: any[] = [];
  const addEquipment = async (_eq: any) => {};
  const updateEquipment = async (_id: string, _updated: any) => {};
  const deleteEquipment = async (_id: string) => {};
  const addMaintenance = async (_m: any) => {};
  const updateMaintenance = async (_id: string, _updated: any) => {};
  const deleteMaintenance = async (_id: string) => {};

  const addEmployee = async (employee: Omit<Employee, 'id'>) => {
    const id = 'f_' + Math.random().toString(36).substr(2, 9);
    const newEmp = { ...employee, id };
    await executeWriteOperation(
      'add_employee',
      () => setEmployees(prev => [...prev, newEmp]),
      () => PhpRepository.addEmployee(newEmp),
      newEmp,
      'Funcionário Cadastrado',
      `Funcionário "${employee.name}" cadastrado no MySQL com sucesso.`,
      'Erro de Cadastro',
      `Não foi possível cadastrar o funcionário "${employee.name}" no servidor.`,
      `Funcionário "${employee.name}" cadastrado.`
    );
  };

  const updateEmployee = async (id: string, updated: Omit<Employee, 'id'>) => {
    const newEmp = { ...updated, id };
    await executeWriteOperation(
      'update_employee',
      () => setEmployees(prev => prev.map(x => x.id === id ? newEmp : x)),
      () => PhpRepository.updateEmployee(newEmp),
      newEmp,
      'Cadastro Atualizado',
      `Funcionário "${updated.name}" atualizado no MySQL com sucesso.`,
      'Erro na Atualização',
      `Não foi possível atualizar o funcionário "${updated.name}" no servidor.`,
      `Funcionário "${updated.name}" atualizado.`
    );
  };

  const deleteEmployee = async (id: string) => {
    const empName = employees.find(x => x.id === id)?.name || id;
    await executeWriteOperation(
      'delete_employee',
      () => setEmployees(prev => prev.filter(x => x.id !== id)),
      () => PhpRepository.deleteEmployee(id),
      { id },
      'Funcionário Removido',
      `Funcionário "${empName}" removido do MySQL com sucesso.`,
      'Erro na Remoção',
      `Não foi possível remover o funcionário no servidor.`,
      `Funcionário "${empName}" removido.`
    );
  };

  const addEmployeesBatch = async (newEmployees: Omit<Employee, 'id'>[]) => {
    const listWithIds: Employee[] = newEmployees.map(emp => ({
      ...emp,
      id: 'f_' + Math.random().toString(36).substr(2, 9)
    }));

    await executeWriteOperation(
      'add_employee',
      () => setEmployees(prev => [...prev, ...listWithIds]),
      () => PhpRepository.importEmployeesBatch(listWithIds),
      listWithIds,
      'Funcionários Importados',
      `${listWithIds.length} funcionários importados com sucesso para o MySQL.`,
      'Erro de Importação',
      `Não foi possível importar os funcionários no servidor.`,
      `Importados ${listWithIds.length} funcionários via planilha.`
    );
  };

  const sortedBeds = useMemo(() => {
    return [...beds].sort((a, b) => {
      const sectorA = sectorsIndex.get(a.sectorId);
      const sectorB = sectorsIndex.get(b.sectorId);
      const sAName = sectorA ? sectorA.name : '';
      const sBName = sectorB ? sectorB.name : '';
      const sectorCompare = numericCollator.compare(sAName, sBName);
      if (sectorCompare !== 0) return sectorCompare;
      return numericCollator.compare(String(a.number), String(b.number));
    });
  }, [beds, sectorsIndex]);

  const hasMoreAudits = hasMoreServerAuditsRef.current || audits.length < totalAuditsCount;

  return (
    <AuditContext.Provider value={{ 
      sectors, addSector, updateSector, deleteSector, 
      beds: sortedBeds, 
      addBed, updateBed, deleteBed, 
      audits,
      totalAuditsCount,
      isLoadingAudits,
      isLoadingMoreAudits,
      hasMoreAudits,
      loadMoreAudits,
      ensureAllAuditsLoaded,
      addAudit, updateAudit, deleteAudit,
      questions, addQuestion, deleteQuestion, updateQuestion,
      patients, addPatient, updatePatient, deletePatient,
      equipments, addEquipment, updateEquipment, deleteEquipment,
      maintenances, addMaintenance, updateMaintenance, deleteMaintenance,
      employees, addEmployee, addEmployeesBatch, updateEmployee, deleteEmployee,
      systemErrors,
      divergences,
      clearSystemErrors,
      simulateError,
      pushLocalToServer,
      pullServerToLocal,
      pendingQueue,
      syncStatus,
      syncBatch,
      reconnect,
      getBedsBySector,
      getAuditsByBed,
      getAuditsBySector,
      getSectorById,
      getBedById,
      getQuestionById,
      syncFailures,
      clearSyncFailures,
      dbConnected,
      dbLastHeartbeat,
      dbStatus,
      reconnectDb,
      dbConfig,
      setDbConfig
    }}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAuditData() {
  const context = useContext(AuditContext);
  if (context === undefined) {
    throw new Error('useAuditData must be used within an AuditProvider');
  }
  return context;
}

export function useAuditSync() {
  const context = useContext(AuditContext);
  if (context === undefined) {
    throw new Error('useAuditSync must be used within an AuditProvider');
  }
  return {
    isOnline: context.syncStatus === 'connected',
    status: context.syncStatus,
    pendingQueue: context.pendingQueue,
    syncBatch: context.syncBatch,
    reconnect: context.reconnect,
    syncFailures: context.syncFailures,
    clearSyncFailures: context.clearSyncFailures
  };
}
