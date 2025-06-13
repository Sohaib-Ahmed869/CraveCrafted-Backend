const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  image: {
    type: String,
    required: [true, 'Image is required']
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
  }
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
  }
  next();
});

module.exports = mongoose.model('Blog', blogSchema); 