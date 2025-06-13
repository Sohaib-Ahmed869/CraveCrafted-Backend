const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');
const {
  getAllBlogs,
  getBlog,
  createBlog,
  updateBlog,
  deleteBlog
} = require('../Controllers/blogController');
const { upload } = require('../Controllers/ProductController');

// Public routes
router.get('/', getAllBlogs);
router.get('/:id', getBlog);

// Protected routes (admin only)
router.post('/', authenticateToken, requireAdmin, upload.single('image'), createBlog);
router.put('/:id', authenticateToken, requireAdmin, upload.single('image'), updateBlog);
router.delete('/:id', authenticateToken, requireAdmin, deleteBlog);

module.exports = router; 