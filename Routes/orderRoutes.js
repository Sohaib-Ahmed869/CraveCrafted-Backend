const express = require('express');
const router = express.Router();

const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getMyOrders,
  cancelOrder,
  deleteOrder,
  confirmStripePayment,
  handleStripeWebhook,
  confirmCODPayment,
  getOrderTracking,
  initiateReturn,
  updateTracking,
  createPaymentIntent,
  confirmPayment
} = require('../Controllers/orderController');

const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');

// Public routes (webhooks)
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Payment routes
router.post('/create-payment-intent', authenticateToken, createPaymentIntent);
router.post('/confirm-payment', authenticateToken, confirmPayment);

// Order routes
router.post('/', authenticateToken, createOrder);
router.get('/', authenticateToken, requireAdmin, getOrders);
router.get('/myorders', authenticateToken, getMyOrders);
router.get('/:id', authenticateToken, getOrderById);
router.get('/:id/tracking', authenticateToken, getOrderTracking);
router.put('/:id/status', authenticateToken, requireAdmin, updateOrderStatus);
router.put('/:id/confirm-payment', authenticateToken, confirmStripePayment);
router.put('/:id/confirm-cod', authenticateToken, requireAdmin, confirmCODPayment);
router.put('/:id/tracking', authenticateToken, requireAdmin, updateTracking);
router.put('/:id/cancel', authenticateToken, cancelOrder);
router.put('/:id/return', authenticateToken, initiateReturn);
router.delete('/:id', authenticateToken, requireAdmin, deleteOrder);

module.exports = router;