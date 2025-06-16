const express = require('express');
const router = express.Router();
const reviewController = require("../Controllers/ReviewController");


// Create a new review
router.post('/', reviewController.createReview);
router.get('/', reviewController.getAllReviews);
router.get('/product/:productId', reviewController.getProductReviews);
router.get('/user/:userId', reviewController.getUserReviews);
router.get('/:id', reviewController.getReviewById);
router.put('/:id', reviewController.updateReview);
router.delete('/:id', reviewController.deleteReview);
router.patch('/:id/helpful', reviewController.markHelpful);

module.exports = router;