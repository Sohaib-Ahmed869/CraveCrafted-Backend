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
  getOrderTracking,
  initiateReturn,
  updateTracking,
  createPaymentIntent,
  confirmPayment,
  // Subscription functions
  getMySubscriptions,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  processRecurringBilling,
  getSubscriptionAnalytics,
  createStripeSubscription,
  getPlans,
  getSubscriptionById,
  updateSubscription,
  getSubscriptionPaymentHistory
} = require('../Controllers/orderController');

const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');

// ===== PUBLIC ROUTES (NO AUTH REQUIRED) =====
// Stripe webhook (must be raw body)
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// ===== PAYMENT ROUTES =====
router.post('/create-payment-intent', authenticateToken, createPaymentIntent);
router.post('/confirm-payment', authenticateToken, confirmPayment);

// ===== SUBSCRIPTION ROUTES (SPECIFIC PATHS FIRST) =====
// Get available subscription plans
router.get('/plans', getPlans);

// Create Stripe subscription (for direct Stripe integration)
router.post('/create-stripe-subscription', authenticateToken, createStripeSubscription);

// User subscription management
router.get('/subscriptions/my', authenticateToken, getMySubscriptions);
router.get('/subscriptions/analytics', authenticateToken, requireAdmin, getSubscriptionAnalytics);
router.post('/subscriptions/process-billing', authenticateToken, requireAdmin, processRecurringBilling);

// Specific subscription operations (/:id patterns)
router.get('/subscriptions/:id/payment-history', authenticateToken, getSubscriptionPaymentHistory);
router.get('/subscriptions/:id', authenticateToken, getSubscriptionById);
router.put('/subscriptions/:id', authenticateToken, updateSubscription);
router.put('/subscriptions/:id/pause', authenticateToken, pauseSubscription);
router.put('/subscriptions/:id/resume', authenticateToken, resumeSubscription);
router.put('/subscriptions/:id/cancel', authenticateToken, cancelSubscription);

// ===== ORDER ROUTES (GENERAL PATTERNS LAST) =====
// Create new order (handles both one-time and subscription orders)
router.post('/', authenticateToken, createOrder);

// Get all orders (admin only)
router.get('/', authenticateToken, requireAdmin, getOrders);

// Get user's orders (both one-time and subscription)
router.get('/myorders', authenticateToken, getMyOrders);

// Specific order operations (/:id patterns)
router.get('/:id', authenticateToken, getOrderById);
router.get('/:id/tracking', authenticateToken, getOrderTracking);
router.put('/:id/status', authenticateToken, requireAdmin, updateOrderStatus);
router.put('/:id/confirm-payment', authenticateToken, confirmStripePayment);
router.put('/:id/tracking', authenticateToken, requireAdmin, updateTracking);
router.put('/:id/cancel', authenticateToken, cancelOrder);
router.put('/:id/return', authenticateToken, initiateReturn);
router.delete('/:id', authenticateToken, requireAdmin, deleteOrder);

module.exports = router;