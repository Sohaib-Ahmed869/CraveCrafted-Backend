const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');
const {
  getAllBlogs,
  getBlog,
  createBlog,
  updateBlog,
  deleteBlog,
  incrementViews,
  getBlogViewAnalytics,
  toggleLike,
  addComment
} = require('../Controllers/blogController');
const { upload } = require('../Controllers/ProductController');

// Public routes
router.get('/', getAllBlogs);
router.get('/:id', getBlog);
router.post('/:id/view', incrementViews);

// Protected routes (admin only)
router.post('/', authenticateToken, requireAdmin, upload.single('image'), createBlog);
router.put('/:id', authenticateToken, requireAdmin, upload.single('image'), updateBlog);
router.delete('/:id', authenticateToken, requireAdmin, deleteBlog);
router.get('/:id/analytics', authenticateToken, requireAdmin, getBlogViewAnalytics);

// Like/unlike a blog
router.post('/:id/like', authenticateToken, toggleLike);
// Add a comment to a blog
router.post('/:id/comment', authenticateToken, addComment);

module.exports = router; 