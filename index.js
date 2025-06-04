const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB } = require('./db');
const dotenv=require("dotenv")
dotenv.config();
const app = express();
app.use(express.json());
connectDB();
app.use(helmet()); 
const UserRouter=require('./Routes/UserRoutes')

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use("/users",UserRouter)

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
}); 

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 API Base URL: http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

module.exports = app; 