import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

let lastDbError = null;

export const isDbConnected = () => mongoose.connection.readyState === 1;
export const getLastDbError = () => lastDbError;

export const connectDB = async () => {
  mongoose.set('strictQuery', true);
  mongoose.set('sanitizeFilter', true);
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    mongoose.set('autoIndex', false);
  }

  if (!process.env.MONGODB_URI) {
    const error = new Error('MONGODB_URI is not set.');
    lastDbError = error;
    throw error;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    lastDbError = null;
    console.log(`[DB] MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    lastDbError = error;
    console.error(`[DB] Error: ${error.message}`);
    throw error;
  }
};
