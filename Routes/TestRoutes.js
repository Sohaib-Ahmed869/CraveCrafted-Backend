const express = require('express');
const router = express.Router();
const {
  publicRoute,
  authenticateToken,
  requireAdmin,
  requireUser
} = require('../Middleware/AuthMiddleware');

// Public route - accessible to everyone
router.get('/public', publicRoute, (req, res) => {
  res.json({
    success: true,
    message: 'This is a public route - accessible to everyone',
    data: {
      timestamp: new Date(),
      isPublic: true
    }
  });
});

// User route - requires user authentication
router.get('/user', authenticateToken, requireUser, (req, res) => {
  res.json({
    success: true,
    message: 'This is a user route - requires user authentication',
    data: {
      user: req.user,
      timestamp: new Date(),
      isUserRoute: true
    }
  });
});

// Admin route - requires admin authentication
router.get('/admin', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: 'This is an admin route - requires admin authentication',
    data: {
      user: req.user,
      timestamp: new Date(),
      isAdminRoute: true
    }
  });
});

// Protected route - requires any authentication
router.get('/protected', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'This is a protected route - requires authentication',
    data: {
      user: req.user,
      timestamp: new Date(),
      isProtected: true
    }
  });
});

module.exports = router; 