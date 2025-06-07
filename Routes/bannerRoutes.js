const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../Middleware/AuthMiddleware');
const { bannerUpload } = require('../config/s3');
const bannerController = require('../Controllers/bannerController');

// Public routes
router.get('/', bannerController.getBanners);
router.get('/active', bannerController.getActiveBanners);

// Protected Admin routes
router.post('/', authenticateToken, requireAdmin, bannerUpload.single('image'), bannerController.createBanner);
router.put('/:id', authenticateToken, requireAdmin, bannerUpload.single('image'), bannerController.updateBanner);
router.delete('/:id', authenticateToken, requireAdmin, bannerController.deleteBanner);

module.exports = router;