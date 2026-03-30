import jwt from 'jsonwebtoken';
import { checkMeetAccess } from '../services/accessService.js';

export default function registerSocketEvents(io) {
  const queues = {};
  let onlineCount = 0;

  const getSearchingCount = () => Object.values(queues).reduce((sum, queue) => sum + (queue?.length || 0), 0);

  const emitStats = () => {
    io.emit('match_stats', {
      online: onlineCount,
      searching: getSearchingCount(),
      updatedAt: new Date().toISOString(),
    });
  };

  io.use((socket, next) => {
    try {
      const token = socket.handshake?.auth?.token
        || socket.handshake?.headers?.authorization?.split('Bearer ')[1]
        || socket.handshake?.query?.token;

      if (!token) {
        const error = new Error('Unauthorized');
        error.data = { code: 'UNAUTHORIZED' };
        next(error);
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded?.id || decoded?._id || null;

      if (!socket.userId) {
        const error = new Error('Unauthorized');
        error.data = { code: 'UNAUTHORIZED' };
        next(error);
        return;
      }

      next();
    } catch (error) {
      const authError = new Error('Unauthorized');
      authError.data = { code: 'UNAUTHORIZED', message: error.message };
      next(authError);
    }
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);
    onlineCount += 1;
    emitStats();

    socket.emit('match_stats', {
      online: onlineCount,
      searching: getSearchingCount(),
      updatedAt: new Date().toISOString(),
    });

    socket.on('join_matchmaking', async ({ bookId, prefType }) => {
      try {
        const access = await checkMeetAccess({ userId: socket.userId, bookId });
        if (!access.access) {
          socket.emit('access_denied', { message: 'Access is locked for this book.' });
          return;
        }
      } catch (error) {
        socket.emit('access_denied', { message: error.message || 'Access check failed.' });
        return;
      }

      const queueKey = `${bookId}_${prefType}`;

      if (!queues[queueKey]) {
        queues[queueKey] = [];
      }

      if (queues[queueKey].length > 0) {
        const partnerSocketId = queues[queueKey].shift();
        const partnerSocket = io.sockets.sockets.get(partnerSocketId);
        if (partnerSocket) {
          const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;

          socket.join(roomId);
          partnerSocket.join(roomId);

          socket.emit('match_found', {
            roomId,
            role: 'caller',
            message: 'You have been paired with a fellow reader.',
          });

          partnerSocket.emit('match_found', {
            roomId,
            role: 'callee',
            message: 'You have been paired with a fellow reader.',
          });

          console.log(`[SOCKET] Matched ${socket.id} & ${partnerSocketId} in ${roomId}`);
          emitStats();
        } else {
          queues[queueKey].push(socket.id);
          emitStats();
        }
      } else {
        queues[queueKey].push(socket.id);
        console.log(`[SOCKET] ${socket.id} added to queue ${queueKey}`);
        emitStats();
      }
    });

    socket.on('leave_matchmaking', ({ bookId, prefType }) => {
      const queueKey = `${bookId}_${prefType}`;
      if (!queues[queueKey]?.length) {
        return;
      }

      const before = queues[queueKey].length;
      queues[queueKey] = queues[queueKey].filter((id) => id !== socket.id);
      if (queues[queueKey].length !== before) {
        emitStats();
      }
    });

    socket.on('send_message', ({ roomId, message, senderId }) => {
      socket.to(roomId).emit('receive_message', { message, senderId, timestamp: new Date() });
    });

    socket.on('webrtc_offer', ({ roomId, offer }) => {
      socket.to(roomId).emit('webrtc_offer', { offer });
    });

    socket.on('webrtc_answer', ({ roomId, answer }) => {
      socket.to(roomId).emit('webrtc_answer', { answer });
    });

    socket.on('webrtc_ice_candidate', ({ roomId, candidate }) => {
      socket.to(roomId).emit('webrtc_ice_candidate', { candidate });
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] User disconnected: ${socket.id}`);
      onlineCount = Math.max(0, onlineCount - 1);
      for (const key in queues) {
        queues[key] = queues[key].filter((id) => id !== socket.id);
      }
      emitStats();
    });
  });
}
