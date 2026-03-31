import mongoose from 'mongoose';

let connected = false;
let lastDbError = null;

export const isDbConnected = () => connected && mongoose.connection.readyState === 1;
export const getLastDbError = () => lastDbError;

export const connectDB = async () => {
  if (isDbConnected()) {
    return true;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const error = new Error('Missing MONGODB_URI for BookFriend server.');
    lastDbError = error;
    throw error;
  }

  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    connected = true;
    lastDbError = null;
    console.log(`[BOOKFRIEND][DB] Connected to MongoDB: ${conn.connection.host}`);
    return true;
  } catch (error) {
    connected = false;
    lastDbError = error;
    throw error;
  }
};
