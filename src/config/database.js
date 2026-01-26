import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // Increase timeout and add proper connection options
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      // Recommended for production
      retryWrites: true,
      w: 'majority'
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    // Ensure connection is ready before proceeding
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection not ready');
    }

    return conn;

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('Full error:', error);
    
    // Log specific connection issues
    if (error.name === 'MongoServerSelectionError') {
      console.error('Could not connect to any MongoDB servers.');
      console.error('Check your connection string and network access.');
    }
    
    process.exit(1);
  }
};

export default connectDB;