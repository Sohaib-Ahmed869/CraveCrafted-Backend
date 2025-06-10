const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getMyOrders
} = require('../Controllers/orderController');
const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');

// Create a new order
router.post('/', authenticateToken, createOrder);

// Get all orders (admin only)
router.get('/', authenticateToken, requireAdmin, getOrders);

// Get my orders (for logged in user)
router.get('/myorders', authenticateToken, getMyOrders);

// Get order by ID
router.get('/:id', authenticateToken, getOrderById);

// Update order status (admin only)
router.put('/:id/status', authenticateToken, requireAdmin, updateOrderStatus);

module.exports = router; 
