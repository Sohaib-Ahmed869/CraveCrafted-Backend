const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true
  },
  hashtags: [{
    type: String,
    trim: true
  }],
  authorName: {
    type: String,
    required: [true, 'Author name is required'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now
  },
  // Optional fields that might be useful
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },
  views: {
    type: Number,
    default: 0
  },
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Pre-save middleware to process hashtags
blogSchema.pre('save', function(next) {
  if (this.isModified('hashtags')) {
    // If hashtags is a string, split it into an array
    if (typeof this.hashtags === 'string') {
      this.hashtags = this.hashtags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
    }
    // Remove duplicates
    this.hashtags = [...new Set(this.hashtags)];
  }
  
  // Generate slug from content if not provided
  if (this.isModified('content') && !this.slug) {
    // Extract plain text from HTML content for slug generation
    const plainText = this.content.replace(/<[^>]*>/g, '');
    const words = plainText.trim().split(/\s+/).slice(0, 10); // First 10 words
    this.slug = words.join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now();
  }
  
  next();
});

// Instance method to get excerpt from content
blogSchema.methods.getExcerpt = function(length = 150) {
  const plainText = this.content.replace(/<[^>]*>/g, '');
  return plainText.length > length 
    ? plainText.substring(0, length) + '...' 
    : plainText;
};

// Static method to find published blogs
blogSchema.statics.findPublished = function() {
  return this.find({ status: 'published' }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Blog', blogSchema);