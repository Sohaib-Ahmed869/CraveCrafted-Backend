const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB } = require('./db');
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();
// Create Express app
const app = express();
// Security middleware
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://crave-crafe-frontend.vercel.app'
];

// Add CORS_ORIGIN to allowedOrigins if it exists and is a valid URL
if (process.env.CORS_ORIGIN) {
  try {
    const corsUrl = new URL(process.env.CORS_ORIGIN);
    allowedOrigins.push(corsUrl.origin);
  } catch (err) {
    console.warn('Invalid CORS_ORIGIN URL:', process.env.CORS_ORIGIN);
  }
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 200
};

// Apply CORS with the proper configuration
app.use(cors(corsOptions));
// Connect to database
connectDB();
// Routes
const authRoutes = require('./Routes/AuthRoutes');
const userRoutes = require('./Routes/UserRoutes');
const testRoutes = require('./Routes/TestRoutes');
const bannerRoutes = require('./Routes/bannerRoutes');
const productRoutes = require('./Routes/ProductRoutes');
const orderRoutes = require('./Routes/orderRoutes');
const blogRoutes = require('./Routes/blogRoutes');
const ReviewRoutes=require("./Routes/ReviewRouter")
const contactRoutes = require('./Routes/ContactRoutes');
// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/test', testRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/review', ReviewRoutes)
app.use('/api/contacts', contactRoutes);
// Error handling middlewares
app.use((err, req, res, next) => {
  console.error(err.stack);
  // Handle payload too large errors specifically
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Request payload too large. Please reduce the content size.',
      error: 'Payload size limit exceeded'
    });
  }
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS error: Origin not allowed',
      error: err.message
    });
  }
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: err.message
  });
});
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});
// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`:rocket: Server running on port ${PORT}`);
  console.log(`:mobile_phone: Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`:globe_with_meridians: API Base URL: http://localhost:${PORT}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`:x: Port ${PORT} is already in use`);
  } else {
    console.error(':x: Server error:', err);
  }
  process.exit(1);
});
module.exports = app;
