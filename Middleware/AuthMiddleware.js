// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../Models/Users');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const generateToken = (userId, role) => {
  return jwt.sign(
    { 
      userId: userId,
      role: role 
    },
    JWT_SECRET,
    { 
      expiresIn: JWT_EXPIRES_IN 
    }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = verifyToken(token);
    
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      userDetails: user
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
};

const requireCustomerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (!['customer', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }
  
  next();
};

const requireOwnershipOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const resourceUserId = req.params.userId || req.body.userId;
  
  if (req.user.role === 'admin' || req.user.userId === resourceUserId) {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own resources.'
    });
  }
};

// Optional middleware to authenticate but not require authentication
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId);
      
      if (user && user.status === 'active') {
        req.user = {
          userId: decoded.userId,
          role: decoded.role,
          userDetails: user
        };
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken,
  requireAdmin,
  requireCustomerOrAdmin,
  requireOwnershipOrAdmin,
  optionalAuth
};