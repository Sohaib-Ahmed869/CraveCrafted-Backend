// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../Models/Users');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const generateToken = (id, role) => {
  return jwt.sign(
    { 
      id: id,
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

// Public route middleware - allows access to all
const publicRoute = (req, res, next) => {
  next();
};

// Main authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    console.log('Auth Headers:', req.headers);
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    
    if (!authHeader) {
      console.log('No authorization header found');
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Handle both "Bearer <token>" and raw token
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : authHeader;

    console.log('Extracted token:', token ? `${token.substring(0, 10)}...` : 'No token');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
      console.log('Decoded token:', decoded);
    } catch (err) {
      console.error('Token verification failed:', err.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: err.message
      });
    }
    
    // Handle both 'id' and 'userId' in the token
    const userId = decoded.userId || decoded.id;
    
    if (!userId) {
      console.log('No user ID found in token');
      return res.status(401).json({
        success: false,
        message: 'Invalid token: No user ID found'
      });
    }
    
    const user = await User.findById(userId).select('-password');
    if (!user) {
      console.log('User not found for ID:', userId);
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.status !== 'active') {
      console.log('User account is not active:', user.email);
      return res.status(401).json({
        success: false,
        message: 'Your account is not active. Please contact support.'
      });
    }

    // Attach user and token to the request
    req.user = user;
    req.token = token;
    
    console.log('User authenticated successfully:', user.email);
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
  try {
    console.log('requireAdmin - Checking user:', req.user ? req.user.email : 'No user');
    
    if (!req.user) {
      console.log('requireAdmin - No user found in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    console.log('requireAdmin - User role:', req.user.role);
    
    if (req.user.role !== 'admin') {
      console.log('requireAdmin - Access denied: User is not an admin');
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
        userRole: req.user.role
      });
    }

    console.log('requireAdmin - User is admin, access granted');
    next();
  } catch (error) {
    console.error('requireAdmin - Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin verification',
      error: error.message
    });
  }
};

// User role middleware
const requireUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'user') {
    return res.status(403).json({
      success: false,
      message: 'User access required'
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

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.status === 'active') {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

// Role-based middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = {
  generateToken,
  verifyToken,
  publicRoute,
  authenticateToken,
  requireAdmin,
  requireUser,
  requireCustomerOrAdmin,
  requireOwnershipOrAdmin,
  optionalAuth,
  requireRole
};