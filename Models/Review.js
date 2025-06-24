const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product ID is required'],
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Order ID is required'],
    index: true
  },
  orderItemId: {
    type: String, // Store the specific order item ID if needed
    required: false
  },
  stars: {
    type: Number,
    required: [true, 'Rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be a whole number'
    }
  },
  feedback: {
    type: String,
    required: [true, 'Feedback is required'],
    trim: true,
    minlength: [10, 'Feedback must be at least 10 characters long'],
    maxlength: [1000, 'Feedback cannot exceed 1000 characters']
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  helpfulCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to ensure one review per user per product PER ORDER
reviewSchema.index({ userId: 1, productId: 1, orderId: 1 }, { unique: true });

// Keep the old index for backward compatibility but make it non-unique
reviewSchema.index({ userId: 1, productId: 1 });

// Virtual for review age
reviewSchema.virtual('reviewAge').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Static method to get average rating for a product
reviewSchema.statics.getAverageRating = async function(productId) {
  const stats = await this.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId) } },
    {
      $group: {
        _id: '$productId',
        averageRating: { $avg: '$stars' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  
  return stats[0] || { averageRating: 0, totalReviews: 0 };
};

// Instance method to check if review is helpful
reviewSchema.methods.isHelpful = function() {
  return this.helpfulCount > 5;
};

module.exports = mongoose.model('Review', reviewSchema);