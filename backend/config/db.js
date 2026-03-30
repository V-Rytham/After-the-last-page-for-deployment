import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export const connectDB = async () => {
  try {
    mongoose.set('strictQuery', true);
    mongoose.set('sanitizeFilter', true);
    if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
      mongoose.set('autoIndex', false);
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set.');
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[DB] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[DB] Error: ${error.message}`);
    process.exit(1);
  }
};
