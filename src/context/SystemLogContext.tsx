import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { checkApi, getDbStatus } from '../lib/apiClient';
import { DbMiddleware } from '../services/dbMiddleware';

export interface SystemLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface DatabaseError {
  id: string;
  timestamp: string;
  message: string;
  host?: string;
  port?: string;
  user?: string;
  dbName?: string;
  troubleshootSuggestion: string;
}

interface SystemLogContextType {
  logs: SystemLog[];
  dbErrors: DatabaseError[];
  addLog: (user: string, action: string, details: string) => void;
  clearLogs: () => void;
  captureDbError: (message: string, host?: string, port?: string, user?: string, dbName?: string) => void;
  clearDbErrors: () => void;
  checkAndLogDbStatus: () => Promise<void>;
  isCheckingDb: boolean;
}

export const SystemLogContext = createContext<SystemLogContextType | undefined>(undefined);

export function SystemLogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [dbErrors, setDbErrors] = useState<DatabaseError[]>([]);
  const [isCheckingDb, setIsCheckingDb] = useState(false);

  // Sync logs from MySQL server on mount
  useEffect(() => {
    async function syncLogs() {
      const isOnline = await checkApi();
      if (isOnline) {
        const data = await DbMiddleware.executeRead();
        if (data && data.logs) {
          setLogs(data.logs);
        }
      }
    }
    syncLogs();
  }, []);

  const addLog = useCallback((user: string, action: string, details: string) => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      user,
      action,
      details
    };
    setLogs(prev => [newLog, ...prev].slice(0, 1000)); // Maintain up to 1000 records

    // Sync to MySQL database via API
    checkApi().then(available => {
      if (available) {
        DbMiddleware.executeWrite('add_log', {
          user: newLog.user,
          action: newLog.action,
          details: newLog.details,
          timestamp: newLog.timestamp
        });
      }
    });
  }, []);

  const captureDbError = useCallback((message: string, host?: string, port?: string, user?: string, dbName?: string) => {
    let suggestion = 'Verifique as credenciais do banco de dados PostgreSQL no painel de Configurações, a conectividade de rede e as regras de firewall do seu servidor.';
    
    const msgLower = message.toLowerCase();
    if (msgLower.includes('password authentication failed') || msgLower.includes('auth')) {
      suggestion = 'Senha incorreta para o usuário especificado. Verifique a senha configurada no painel de Configurações e tente novamente.';
    } else if (msgLower.includes('enotfound') || msgLower.includes('getaddrinfo') || msgLower.includes('dns')) {
      suggestion = 'Host inválido ou inacessível. Certifique-se de que o endereço do servidor PostgreSQL está digitado corretamente e que o servidor DNS consegue resolvê-lo.';
    } else if (msgLower.includes('econnrefused') || msgLower.includes('refused')) {
      suggestion = 'Conexão recusada pelo servidor na porta especificada. Verifique se o serviço PostgreSQL está rodando e se aceita conexões remotas na porta (padrão: 5432).';
    } else if (msgLower.includes('database') && msgLower.includes('does not exist')) {
      suggestion = 'O banco de dados especificado não existe no servidor PostgreSQL. Crie o banco de dados no seu painel PostgreSQL ou digite um nome de banco existente.';
    } else if (msgLower.includes('timeout') || msgLower.includes('tempo limite')) {
      suggestion = 'Tempo limite de conexão esgotado. O servidor pode estar sobrecarregado ou as regras de firewall (como no Google Cloud ou AWS) podem estar bloqueando o tráfego de entrada.';
    }

    const newDbError: DatabaseError = {
      id: 'db-err-' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      message,
      host,
      port,
      user,
      dbName,
      troubleshootSuggestion: suggestion
    };

    setDbErrors(prev => [newDbError, ...prev].slice(0, 100));
    
    // Also add to system logs so it is visible in the general log tab
    addLog(
      'Sistema (PostgreSQL Monitor)',
      'FALHA_CONEXAO_DB',
      `Erro ao conectar ao PostgreSQL no host ${host || 'desconhecido'}: ${message}. Solução sugerida: ${suggestion}`
    );
  }, [addLog]);

  const clearDbErrors = useCallback(() => {
    setDbErrors([]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const checkAndLogDbStatus = useCallback(async () => {
    setIsCheckingDb(true);
    try {
      const status = await getDbStatus();
      if (status && status.success) {
        if (status.isPostgresConfigured && !status.ping.success) {
          // If configured but ping failed, log the error
          captureDbError(
            status.ping.message || 'Falha no teste de conexão (ping)',
            status.connectionDetails?.host,
            status.connectionDetails?.port,
            status.connectionDetails?.user,
            status.connectionDetails?.name
          );
        } else if (status.isPostgresConfigured && status.ping.success) {
          // Connection is healthy!
          console.log('[SystemLogContext] Conexão PostgreSQL saudável verificada.');
        }
      }
    } catch (err: any) {
      console.error('[SystemLogContext] Erro ao obter status do banco:', err);
    } finally {
      setIsCheckingDb(false);
    }
  }, [captureDbError]);

  // Check database status on startup to record any errors
  useEffect(() => {
    checkAndLogDbStatus();
  }, [checkAndLogDbStatus]);

  return (
    <SystemLogContext.Provider value={{ 
      logs, 
      dbErrors, 
      addLog, 
      clearLogs, 
      captureDbError, 
      clearDbErrors, 
      checkAndLogDbStatus,
      isCheckingDb
    }}>
      {children}
    </SystemLogContext.Provider>
  );
}

export function useSystemLogs() {
  const context = useContext(SystemLogContext);
  if (context === undefined) {
    throw new Error('useSystemLogs must be used within a SystemLogProvider');
  }
  return context;
}
