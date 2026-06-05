'use strict';

const { Server } = require('socket.io');
const env = require('../config/env');
const logger = require('../config/logger');
const { verifyAccessToken } = require('../utils/jwt');
const { verifyTestToken } = require('../utils/tokenGenerator');
const candidateRepository = require('../repositories/candidateRepository');
const sessionRepository = require('../repositories/sessionRepository');
const { CHEAT_EVENT_TYPES } = require('../utils/constants');

const ROOMS = {
  ADMIN: 'admin:proctor',
  candidate: (id) => `candidate:${id}`,
};

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    pingTimeout: 30_000,
  });

  io.use((socket, next) => {
    const role = socket.handshake.auth?.role;
    try {
      if (role === 'admin') {
        const jwt = socket.handshake.auth?.token;
        if (!jwt) return next(new Error('Auth required'));
        const payload = verifyAccessToken(jwt);
        socket.data.adminId = payload.sub;
        return next();
      }
      if (role === 'candidate') {
        const testToken = socket.handshake.auth?.testToken;
        if (!testToken || !verifyTestToken(testToken)) return next(new Error('Invalid test token'));
        socket.data.testToken = testToken;
        return next();
      }
      return next(new Error('Unknown role'));
    } catch (err) {
      return next(err);
    }
  });

  io.on('connection', async (socket) => {
    const role = socket.handshake.auth?.role;
    if (role === 'admin') {
      socket.join(ROOMS.ADMIN);
      logger.info('Admin proctor connected', { adminId: socket.data.adminId });
    } else if (role === 'candidate') {
      const candidate = await candidateRepository.findByTestToken(socket.data.testToken);
      if (!candidate) return socket.disconnect(true);
      socket.data.candidateId = candidate.id;
      socket.join(ROOMS.candidate(candidate.id));
      io.to(ROOMS.ADMIN).emit('candidate:online', { candidateId: candidate.id, name: candidate.name });

      socket.on('cheat:event', async ({ type, meta } = {}) => {
        const valid = Object.values(CHEAT_EVENT_TYPES).includes(type);
        if (!valid) return;
        const session = await sessionRepository.findByCandidate(candidate.id);
        if (session) {
          await sessionRepository.pushCheatEvent(session.id, { type, at: new Date(), meta });
        }
        io.to(ROOMS.ADMIN).emit('candidate:cheat', { candidateId: candidate.id, type, at: new Date() });
      });

      socket.on('disconnect', () => {
        io.to(ROOMS.ADMIN).emit('candidate:offline', { candidateId: candidate.id });
      });
    }
  });

  return io;
};

module.exports = { initSocket, ROOMS };
