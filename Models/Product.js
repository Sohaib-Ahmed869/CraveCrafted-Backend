const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new Schema({
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
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  stock: {
    type: Number,
    required: [true, 'Stock is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  image: {
    type: String,  // S3 key/path
    required: [true, 'Image is required']
  },
  imageUrl: {
    type: String,  // Full S3 URL
    required: [true, 'Image URL is required']
  },
  tagline: {
    type: String,
    required: [true, 'Tagline is required'],
    trim: true
  },
  ingredients: [{
    type: String,
    required: [true, 'At least one ingredient is required'],
    trim: true
  }],
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages']
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', productSchema); 