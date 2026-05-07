'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.mongo.uri, {
      autoIndex: !env.isProduction,
      serverSelectionTimeoutMS: 10_000,
    });
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => logger.error('MongoDB error', { err: err.message }));

    return conn;
  } catch (err) {
    logger.error('MongoDB connection failed', { err: err.message });
    throw err;
  }
};

const disconnectDB = async () => {
  await mongoose.connection.close();
};

module.exports = { connectDB, disconnectDB };
