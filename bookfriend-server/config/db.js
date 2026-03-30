import mongoose from 'mongoose';

let connected = false;

export const connectDB = async () => {
  if (connected) {
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI for BookFriend server.');
  }

  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  console.log(`[BOOKFRIEND][DB] Connected to MongoDB: ${conn.connection.host}`);
};
