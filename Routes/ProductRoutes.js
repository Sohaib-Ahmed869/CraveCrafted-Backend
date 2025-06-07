const express = require('express');
const router = express.Router();
const {
  upload,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct
} = require('../Controllers/ProductController');
const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');

// Public routes
router.get('/', getAllProducts);
router.get('/:id', getProduct);

// Admin routes
router.post('/', authenticateToken, requireAdmin, upload.single('image'), createProduct);
router.put('/:id', authenticateToken, requireAdmin, upload.single('image'), updateProduct);
router.delete('/:id', authenticateToken, requireAdmin, deleteProduct);

module.exports = router; 