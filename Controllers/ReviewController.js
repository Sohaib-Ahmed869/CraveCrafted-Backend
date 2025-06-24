const Review = require('../Models/Review');
const mongoose = require('mongoose');

const reviewController = {
  // Create a new review
  createReview: async (req, res) => {
    try {
      const { userId, productId, orderId, orderItemId, stars, feedback } = req.body;

      // Validate required fields
      if (!userId || !productId || !orderId || !stars || !feedback) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required: userId, productId, orderId, stars, feedback'
        });
      }

      // Check if user already reviewed this product for this specific order
      const existingReview = await Review.findOne({ userId, productId, orderId });
      if (existingReview) {
        return res.status(409).json({
          success: false,
          message: 'You have already reviewed this product for this order'
        });
      }

      const review = new Review({
        userId,
        productId,
        orderId,
        orderItemId,
        stars,
        feedback
      });

      await review.save();
      await review.populate('userId', 'name email');
      await review.populate('productId', 'name');
      await review.populate('orderId');

      res.status(201).json({
        success: true,
        message: 'Review created successfully',
        data: review
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Error creating review',
        error: error.message
      });
    }
  },

  // Get all reviews with pagination and filtering
  getAllReviews: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      const filter = {};
      if (req.query.productId) filter.productId = req.query.productId;
      if (req.query.userId) filter.userId = req.query.userId;
      if (req.query.orderId) filter.orderId = req.query.orderId;
      if (req.query.stars) filter.stars = parseInt(req.query.stars);

      const reviews = await Review.find(filter)
        .populate('userId', 'name email')
        .populate('productId', 'name')
        .populate('orderId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Review.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: reviews,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalReviews: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching reviews',
        error: error.message
      });
    }
  },

  // Get reviews for a specific product
  getProductReviews: async (req, res) => {
    try {
      const { productId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product ID'
        });
      }

      const reviews = await Review.find({ productId })
        .populate('userId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Review.countDocuments({ productId });
      const stats = await Review.getAverageRating(productId);

      res.status(200).json({
        success: true,
        data: reviews,
        stats: {
          averageRating: parseFloat(stats.averageRating?.toFixed(1)) || 0,
          totalReviews: stats.totalReviews
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalReviews: total
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching product reviews',
        error: error.message
      });
    }
  },

  // Get reviews by a specific user
  getUserReviews: async (req, res) => {
    try {
      const { userId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }

      const reviews = await Review.find({ userId })
        .populate('productId', 'name')
        .populate('orderId')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: reviews,
        totalReviews: reviews.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching user reviews',
        error: error.message
      });
    }
  },

  // Get a specific review by ID
  getReviewById: async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review ID'
        });
      }

      const review = await Review.findById(id)
        .populate('userId', 'name email')
        .populate('productId', 'name')
        .populate('orderId');

      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found'
        });
      }

      res.status(200).json({
        success: true,
        data: review
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching review',
        error: error.message
      });
    }
  },

  // Update a review
  updateReview: async (req, res) => {
    try {
      const { id } = req.params;
      const { stars, feedback } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review ID'
        });
      }

      const review = await Review.findById(id);
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found'
        });
      }

      // Update only provided fields
      if (stars !== undefined) review.stars = stars;
      if (feedback !== undefined) review.feedback = feedback;

      await review.save();
      await review.populate('userId', 'name email');
      await review.populate('productId', 'name');
      await review.populate('orderId');

      res.status(200).json({
        success: true,
        message: 'Review updated successfully',
        data: review
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Error updating review',
        error: error.message
      });
    }
  },

  // Delete a review
  deleteReview: async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review ID'
        });
      }

      const review = await Review.findByIdAndDelete(id);
      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Review deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting review',
        error: error.message
      });
    }
  },

  // Mark review as helpful
  markHelpful: async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid review ID'
        });
      }

      const review = await Review.findByIdAndUpdate(
        id,
        { $inc: { helpfulCount: 1 } },
        { new: true }
      ).populate('userId', 'name');

      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Review not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Review marked as helpful',
        data: { helpfulCount: review.helpfulCount }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error marking review as helpful',
        error: error.message
      });
    }
  }
};

module.exports = reviewController;