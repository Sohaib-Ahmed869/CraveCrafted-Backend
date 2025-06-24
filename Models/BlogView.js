const mongoose = require('mongoose');

const blogViewSchema = new mongoose.Schema({
  blogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog',
    required: true
  },
  clientIP: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    default: ''
  },
  viewedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create compound index for efficient queries
blogViewSchema.index({ blogId: 1, clientIP: 1, viewedAt: 1 });

// TTL index to automatically delete old view records (after 30 days)
blogViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('BlogView', blogViewSchema); 