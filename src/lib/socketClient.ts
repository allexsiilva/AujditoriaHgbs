import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    const serverUrl = window.location.origin;
    socketInstance = io(serverUrl, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      autoConnect: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Conectado ao servidor HospAudit em tempo real. ID:', socketInstance?.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.warn('[Socket.IO] Desconectado do servidor HospAudit:', reason);
    });

    socketInstance.on('connect_error', (error) => {
      if (error.message !== 'websocket error') {
        console.warn('[Socket.IO] Tentando reconexão:', error.message);
      }
    });
  }

  return socketInstance;
}

export function subscribeToDbUpdates(callback: (data: { key?: string; timestamp: number }) => void) {
  const socket = getSocket();
  const handler = (data: { key?: string; timestamp: number }) => {
    callback(data);
  };
  socket.on('db_updated', handler);
  return () => {
    socket.off('db_updated', handler);
  };
}

export function subscribeToSqlErrors(callback: (data: any) => void) {
  const socket = getSocket();
  const handler = (data: any) => {
    callback(data);
  };
  socket.on('sql_error', handler);
  return () => {
    socket.off('sql_error', handler);
  };
}
