const express = require('express');
const router = express.Router();
const {
  upload,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  getFeaturedProducts,
  getTotalProductsCount
} = require('../Controllers/ProductController');
const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');

// Public routes
router.get('/', getAllProducts);
router.get('/featured', getFeaturedProducts);
router.get('/total-count', getTotalProductsCount);
router.get('/:id', getProduct);

// Admin routes
router.post('/', authenticateToken, requireAdmin, upload.single('image'), createProduct);
router.put('/:id', authenticateToken, requireAdmin, upload.single('image'), updateProduct);
router.delete('/:id', authenticateToken, requireAdmin, deleteProduct);

module.exports = router; 