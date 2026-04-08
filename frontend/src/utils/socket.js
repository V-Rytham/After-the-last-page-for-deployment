import { io } from 'socket.io-client';
import { getStoredToken } from './auth';
import { getSocketServerUrl } from './serviceUrls';

const socketServer = getSocketServerUrl();

export const meetSocket = io(socketServer, {
  withCredentials: true,
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 600,
  timeout: 4000,
});

export const syncMeetSocketAuth = () => {
  const token = getStoredToken();
  meetSocket.auth = token ? { token } : {};
};

