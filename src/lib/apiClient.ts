import { Sector, Bed, AuditRecord, AuditQuestion, Patient } from '../types';
import { User, CargoProfile } from '../context/AuthContext';
import { SystemLog } from '../context/SystemLogContext';
import { DataValidator } from './dataValidator';

// Resolve URL dynamically so it works in both dev (absolute with fallback) and prod (same-origin relative)
const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('run.app'));
// Em desenvolvimento, tenta bater na raiz correspondente se houver api.php, mas em produção acessa relativo
const API_URL = '/api.php';

export interface ServerData {
  sectors: Sector[];
  beds: Bed[];
  audits: AuditRecord[];
  total_audits?: number;
  page?: number;
  limit?: number;
  total_pages?: number;
  has_more?: boolean;
  logs: SystemLog[];
  users: User[];
  questions: AuditQuestion[];
  patients: Patient[];
  cargos?: CargoProfile[];
  modulos_sistema?: any[];
  permissoes?: any[];
}

export interface AuditQueryParams {
  page?: number;
  limit?: number;
  sectorId?: string;
  bedId?: string;
  type?: string;
  status?: string;
  conformity?: string;
  filterDate?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: 'sector_bed' | 'recent' | 'oldest' | 'score_desc' | 'score_asc';
}

export interface PaginatedAuditsResponse {
  success: boolean;
  audits: AuditRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalAll: number;
    totalPages: number;
    hasMore: boolean;
  };
}

let isApiAvailableCached: boolean | null = null;
let lastCacheTime = 0;
const CACHE_DURATION_MS = 3000; // 3 seconds cache to avoid overloading, but recover instantly on failure

let lastApiErrorMessage: string | null = null;

/**
 * Gets the last encountered server-side database connection error.
 */
export function getLastApiError(): string | null {
  if (typeof window !== 'undefined') {
    const localErr = window.localStorage.getItem('hospaudit_last_api_error');
    if (localErr) return localErr;
  }
  return lastApiErrorMessage;
}

/**
 * Clears the stored api error.
 */
export function clearLastApiError() {
  lastApiErrorMessage = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('hospaudit_last_api_error');
  }
}

/**
 * Checks if the PHP MySQL database API is currently accessible.
 */
export async function checkApi(): Promise<boolean> {
  const now = Date.now();
  if (isApiAvailableCached !== null && (now - lastCacheTime < CACHE_DURATION_MS)) {
    return isApiAvailableCached;
  }

  // Try up to 3 times with progressive timeouts to bypass cold-start or temporary network hiccups
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutMs = attempt === 1 ? 5000 : (attempt === 2 ? 8000 : 12000);
      const id = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${API_URL}?action=ping`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(id);

      if (res.ok) {
        const data = await res.json();
        const success = data && (data.success === true || data.status === 'online');
        if (success) {
          isApiAvailableCached = true;
          lastCacheTime = now;
          lastApiErrorMessage = null;
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem('hospaudit_last_api_error');
          }
          return true;
        } else if (data && data.message) {
          lastApiErrorMessage = data.message;
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('hospaudit_last_api_error', data.message);
          }
        }
      } else {
        const errText = `Erro HTTP ${res.status}: ${res.statusText}`;
        lastApiErrorMessage = errText;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('hospaudit_last_api_error', errText);
        }
      }
    } catch (e: any) {
      if (attempt === 3) {
        console.warn(`checkApi failed after 3 attempts:`, e);
        const failText = `Erro de rede ou conexão recusada: ${e.message || String(e)}`;
        lastApiErrorMessage = failText;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('hospaudit_last_api_error', failText);
        }
      } else {
        // Wait a tiny bit before retrying
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  isApiAvailableCached = false;
  lastCacheTime = now;
  return false;
}

/**
 * Resets the API cache detection.
 */
export function resetApiCache() {
  isApiAvailableCached = null;
  lastCacheTime = 0;
}

export interface BackendHealthResult {
  online: boolean;
  latencyMs: number;
  service?: string;
  dbMode?: string;
  error?: string;
  checkedAt: string;
}

/**
 * Fast, non-blocking startup check against the local Node.js backend (/api/health -> fallback /api.php?action=ping).
 */
export async function checkBackendHealth(timeoutMs: number = 3500): Promise<BackendHealthResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const checkedAt = new Date().toISOString();

  const tryEndpoint = async (url: string): Promise<{ ok: boolean; data?: any; status?: number; error?: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { ok: false, status: res.status, error: `HTTP ${res.status} (${res.statusText || 'Sem resposta do backend'})` };
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { ok: false, status: res.status, error: 'Resposta inválida do servidor (esperado JSON).' };
      }

      const data = await res.json();
      const online = Boolean(data && (data.success === true || data.status === 'online'));
      return {
        ok: online,
        data,
        error: online ? undefined : (data?.message || 'Servidor backend retornou status offline.')
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        return { ok: false, error: `Tempo limite excedido (${timeoutMs}ms) aguardando o servidor Node.js.` };
      }
      return { ok: false, error: err?.message || 'Conexão recusada com o servidor backend.' };
    }
  };

  let probe = await tryEndpoint('/api/health');
  if (!probe.ok) {
    const fallback = await tryEndpoint(`${API_URL}?action=ping`);
    if (fallback.ok) {
      probe = fallback;
    } else if (!probe.error) {
      probe = fallback;
    }
  }

  const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const latencyMs = Math.max(1, Math.round(finishedAt - startedAt));

  if (probe.ok) {
    isApiAvailableCached = true;
    lastCacheTime = Date.now();
    lastApiErrorMessage = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('hospaudit_last_api_error');
    }
    return {
      online: true,
      latencyMs,
      service: probe.data?.service || 'hospaudit-node',
      dbMode: probe.data?.dbMode,
      checkedAt
    };
  }

  const errMsg = probe.error || 'Servidor Node.js local não está respondendo.';
  isApiAvailableCached = false;
  lastCacheTime = Date.now();
  lastApiErrorMessage = errMsg;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('hospaudit_last_api_error', errMsg);
  }
  return {
    online: false,
    latencyMs,
    error: errMsg,
    checkedAt
  };
}

/**
 * Fetches all persistent data from the MySQL database with optional pagination.
 */
export async function loadFromServer(page?: number, limit?: number): Promise<ServerData | null> {
  try {
    let url = `${API_URL}?action=get_data`;
    if (page !== undefined && limit !== undefined) {
      url += `&page=${page}&limit=${limit}`;
    }

    let userEmail = '';
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('hospaudit_current_user') || window.sessionStorage.getItem('hospaudit_current_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.email) {
            userEmail = parsed.email;
          }
        }
      } catch (e) {
        console.warn('Error reading current user for X-User-Email header', e);
      }
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(userEmail ? { 'X-User-Email': userEmail } : {})
      }
    });

    if (!res.ok) {
      const errText = `Erro HTTP ${res.status}: ${res.statusText}`;
      lastApiErrorMessage = errText;
      if (typeof window !== 'undefined') {
        localStorage.setItem('hospaudit_last_api_error', errText);
      }
      return null;
    }
    const data = await res.json();
    if (data && data.success) {
      lastApiErrorMessage = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('hospaudit_last_api_error');
      }
      return {
        sectors: data.sectors || [],
        beds: data.beds || [],
        audits: data.audits || [],
        total_audits: data.total_audits,
        page: data.page,
        limit: data.limit,
        total_pages: data.total_pages,
        has_more: data.has_more,
        logs: data.logs || [],
        users: data.users || [],
        questions: data.questions || [],
        patients: data.patients || [],
        cargos: data.cargos || [],
        modulos_sistema: data.modulos_sistema || [],
        permissoes: data.permissoes || []
      };
    } else if (data && data.message) {
      lastApiErrorMessage = data.message;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('hospaudit_last_api_error', data.message);
      }
    }
    return null;
  } catch (e: any) {
    console.error('Falha ao obter dados do MySQL via PHP:', e);
    const failText = `Erro de conexão: ${e.message || String(e)}`;
    lastApiErrorMessage = failText;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hospaudit_last_api_error', failText);
    }
    return null;
  }
}

/**
 * Fetches filtered, sorted and paginated clinical audits from the server.
 */
export async function fetchPaginatedAudits(
  params: AuditQueryParams,
  signal?: AbortSignal
): Promise<PaginatedAuditsResponse | null> {
  try {
    const query = new URLSearchParams({ action: 'get_audits_paginated' });
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.sectorId && params.sectorId !== 'ALL') query.set('sectorId', params.sectorId);
    if (params.bedId && params.bedId !== 'ALL') query.set('bedId', params.bedId);
    if (params.type && params.type !== 'ALL') query.set('type', params.type);
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.conformity && params.conformity !== 'ALL') query.set('conformity', params.conformity);
    if (params.filterDate) query.set('filterDate', params.filterDate);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.search && params.search.trim()) query.set('search', params.search.trim());
    if (params.sortBy) query.set('sortBy', params.sortBy);

    let userEmail = '';
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('hospaudit_current_user') || window.sessionStorage.getItem('hospaudit_current_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.email) {
            userEmail = parsed.email;
          }
        }
      } catch {}
    }

    const res = await fetch(`${API_URL}?${query.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(userEmail ? { 'X-User-Email': userEmail } : {})
      },
      signal
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success) {
      return data as PaginatedAuditsResponse;
    }
    return null;
  } catch (e: any) {
    if (e?.name === 'AbortError') return null;
    console.warn('Falha ao buscar página de auditorias:', e);
    return null;
  }
}

/**
 * Posts an action to the PHP MySQL API.
 */
export async function saveToServer(action: string, payload: any): Promise<boolean> {
  try {
    // Execute data validation and sanitization middleware
    const validatedPayload = DataValidator.validateAndSanitize(action, payload);

    let userEmail = '';
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('hospaudit_current_user') || window.sessionStorage.getItem('hospaudit_current_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.email) {
            userEmail = parsed.email;
          }
        }
      } catch (e) {
        console.warn('Error reading current user for X-User-Email header', e);
      }
    }

    const res = await fetch(`${API_URL}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userEmail ? { 'X-User-Email': userEmail } : {})
      },
      body: JSON.stringify(validatedPayload)
    });
    
    let data;
    try {
      data = await res.json();
    } catch {
      data = { success: false, message: 'Resposta inválida do servidor.' };
    }

    if (!res.ok || (data && data.success === false)) {
      throw new Error(data?.message || `Erro de rede ou gravação no servidor (Status: ${res.status}).`);
    }
    return data && data.success === true;
  } catch (e) {
    console.warn(`Erro enviando ação ${action} para o servidor:`, e);
    throw e;
  }
}

/**
 * Triggers a database backup on the server.
 */
export async function createServerBackup(): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    const res = await fetch(`${API_URL}?action=backup_db`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
        return { success: false, message: 'Falha na resposta do servidor.' };
    }
    const data = await res.json();
    return {
        success: data.success,
        url: data.url,
        message: data.message || 'Erro desconhecido.'
    };
  } catch (e) {
    // console.error('Falha ao acionar backup no servidor:', e);
    return { success: false, message: 'Erro de conexão/rede ao fazer backup.' };
  }
}

/**
 * Lists all backup files from the server.
 */
export async function listServerBackups(): Promise<any[]> {
  try {
    const isOnline = await checkApi();
    let url = '/api/backups';
    if (isOnline) {
      url = `${API_URL}?action=list_backups`;
    }
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data && data.success ? data.backups || [] : [];
  } catch (e) {
    console.warn('Erro ao obter backups do servidor:', e);
    return [];
  }
}

/**
 * Deletes a backup file from the server.
 */
export async function deleteServerBackup(filename: string): Promise<boolean> {
  try {
    const isOnline = await checkApi();
    if (isOnline) {
      const res = await fetch(`${API_URL}?action=delete_backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data && data.success);
    } else {
      const res = await fetch(`/api/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!(data && data.success);
    }
  } catch (e) {
    console.warn('Erro ao excluir backup do servidor:', e);
    return false;
  }
}

/**
 * Manually or automatically posts all modules to save as JSON on the server.
 */
export async function triggerServerBackupJSON(payload: any): Promise<{ success: boolean; filename?: string; message?: string }> {
  try {
    const isOnline = await checkApi();
    let url = '/api/backup-auto';
    
    // In production PHP, we send to action=backup_auto_json
    if (isOnline) {
      url = `${API_URL}?action=backup_auto_json`;
    }
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      return { success: false, message: 'Falha na resposta do servidor.' };
    }
    
    const data = await res.json();
    return {
      success: data && data.success,
      filename: data?.filename,
      message: data?.message || 'Backup JSON salvo com sucesso no servidor.'
    };
  } catch (e) {
    console.warn('Erro ao salvar backup JSON no servidor:', e);
    return { success: false, message: 'Erro de rede ou conexão.' };
  }
}

/**
 * Fetches the current database status and mode (PostgreSQL vs mock mode).
 */
export async function getDbStatus(): Promise<{
  success: boolean;
  isUsingPostgres: boolean;
  isPostgresConfigured: boolean;
  uptimeSeconds?: number;
  uptimeFormatted?: string;
  serverPort?: number;
  syncMode?: string;
  connectionDetails: {
    host: string;
    port: string;
    user: string;
    name: string;
    password?: string;
  };
  ping: {
    success: boolean;
    message: string;
  };
} | null> {
  try {
    const res = await fetch(`${API_URL}?action=get_db_status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Erro ao obter status do banco:', e);
    return null;
  }
}

/**
 * Saves database connection credentials to configuration state and .env.
 */
export async function saveDbConfig(config: any): Promise<{
  success: boolean;
  message: string;
  isUsingPostgres?: boolean;
  isPostgresConfigured?: boolean;
} | null> {
  try {
    const res = await fetch(`${API_URL}?action=save_db_config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      try {
        const errorData = await res.json();
        return errorData;
      } catch {
        return { success: false, message: `Erro HTTP ${res.status}` };
      }
    }
    return await res.json();
  } catch (e: any) {
    console.warn('Erro ao salvar configuração do banco:', e);
    return { success: false, message: e.message || String(e) };
  }
}

export interface SqlErrorLogItem {
  id: string;
  timestamp: string;
  context: string;
  query: string;
  code: string;
  message: string;
  friendlyMessage: string;
}

export async function getSqlErrors(): Promise<SqlErrorLogItem[]> {
  try {
    const res = await fetch(`${API_URL}?action=get_sql_errors`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.errors || [];
  } catch (e) {
    console.warn('Erro ao buscar logs de SQL:', e);
    return [];
  }
}

export async function clearSqlErrors(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}?action=clear_sql_errors`, { method: 'POST' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    console.warn('Erro ao limpar logs de SQL:', e);
    return false;
  }
}

export async function syncLocalToMysql(): Promise<{
  success: boolean;
  message: string;
  details?: {
    totalTables: number;
    totalRecords: number;
    syncedTables: string[];
  };
}> {
  try {
    const res = await fetch(`${API_URL}?action=sync_local_to_mysql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (e: any) {
    console.error('Erro ao sincronizar arquivos locais com MySQL:', e);
    return {
      success: false,
      message: e.message || 'Erro de conexão com o servidor Node.js.'
    };
  }
}

export async function reconnectMysql(): Promise<{
  success: boolean;
  isUsingPostgres: boolean;
  message: string;
}> {
  try {
    const res = await fetch(`${API_URL}?action=reconnect_mysql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (e: any) {
    console.error('Erro ao reconectar MySQL:', e);
    return {
      success: false,
      isUsingPostgres: false,
      message: e.message || 'Erro de conexão ao tentar reconectar.'
    };
  }
}

export async function testDbConfig(config: {
  host: string;
  port: number | string;
  user: string;
  password?: string;
  name?: string;
  database?: string;
}): Promise<{
  success: boolean;
  message: string;
  version?: string;
  latencyMs?: number;
  userFriendlyHint?: string;
  rawError?: string;
}> {
  try {
    const res = await fetch('/api/db/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(config)
    });
    return await res.json();
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Erro ao conectar ao servidor para teste de banco.'
    };
  }
}

export async function getDbConfig(): Promise<{
  success: boolean;
  connected: boolean;
  host: string;
  port: number;
  user: string;
  database: string;
  enabled: boolean;
  hasPassword: boolean;
  syncMode: string;
  message: string;
} | null> {
  try {
    const res = await fetch('/api/db/config', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Erro ao obter configuração do banco:', e);
    return null;
  }
}

export async function runSafeDatabaseMigration(): Promise<{
  success: boolean;
  message: string;
  tablesCreated?: string[];
  columnsAdded?: string[];
  totalTablesChecked?: number;
  backupSnapshot?: string;
}> {
  try {
    const res = await fetch('/api/db/safe-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Erro ao comunicar com o servidor para migração segura de banco.'
    };
  }
}

export interface AutoSyncStatusResponse {
  success: boolean;
  enabled: boolean;
  intervalMinutes: number;
  lastSyncTimestamp: string | null;
  nextSyncTimestamp: number;
  lastStatus?: {
    success: boolean;
    message: string;
    totalTables?: number;
    totalRecords?: number;
  } | null;
  isRunning?: boolean;
}

export async function getAutoSyncStatus(): Promise<AutoSyncStatusResponse | null> {
  try {
    const res = await fetch('/api/db/auto-sync', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Erro ao obter status do auto-sync:', e);
    return null;
  }
}

export async function updateAutoSyncConfig(params: {
  enabled: boolean;
  intervalMinutes: number;
}): Promise<{ success: boolean; message: string; nextSyncTimestamp?: number }> {
  try {
    const res = await fetch('/api/db/auto-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(params)
    });
    return await res.json();
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Erro ao atualizar configuração de envio automático.'
    };
  }
}

export async function triggerAutoSyncNow(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    const res = await fetch('/api/db/sync-now', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Erro ao disparar envio imediato.'
    };
  }
}

// ==================== BANCO NATIVO DO NODE.JS ====================

export interface NodeDbStatusResponse {
  success: boolean;
  isNativeActive: boolean;
  mode: 'node_native' | 'mysql_xampp';
  engine: string;
  dataDirectory: string;
  stats: {
    audits: number;
    sectors: number;
    beds: number;
    questions: number;
    users: number;
    patients: number;
    logs: number;
  };
  files: Array<{
    name: string;
    sizeKb: string;
    updatedAt: string;
  }>;
  message?: string;
}

export async function getNodeDbStatus(): Promise<NodeDbStatusResponse | null> {
  try {
    const res = await fetch('/api/node-db/status', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Erro ao obter status do banco nativo Node.js:', e);
    return null;
  }
}

export async function activateNodeNativeDb(): Promise<{
  success: boolean;
  isNativeActive: boolean;
  mode: string;
  message: string;
}> {
  try {
    const res = await fetch('/api/node-db/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (e: any) {
    return {
      success: false,
      isNativeActive: false,
      mode: 'error',
      message: e.message || 'Erro ao ativar o banco nativo do Node.js.'
    };
  }
}

export async function migrateJsonToNodeDb(
  backupData: any,
  mode: 'merge' | 'overwrite' = 'merge',
  activateNative: boolean = true
): Promise<{
  success: boolean;
  message: string;
  mode?: string;
  isNativeActive?: boolean;
  stats?: {
    sectors: number;
    beds: number;
    audits: number;
    questions: number;
    users: number;
    patients: number;
    cargos: number;
    logs: number;
  };
  totalAudits?: number;
  totalBeds?: number;
  totalSectors?: number;
  totalPatients?: number;
  totalUsers?: number;
  snapshotFilename?: string;
}> {
  try {
    const res = await fetch('/api/node-db/migrate-backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        backupData,
        mode,
        activateNative
      })
    });
    return await res.json();
  } catch (e: any) {
    return {
      success: false,
      message: e.message || 'Erro ao enviar backup para migração no banco nativo.'
    };
  }
}
