const mongoose = require('mongoose');
const { Schema } = mongoose;

const contactFormSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please provide a valid email address'
    ]
  },
  
  phone: {
    type: String,
    trim: true,
    match: [
      /^[\+]?[1-9][\d]{0,15}$/,
      'Please provide a valid phone number'
    ],
    default: null
  },
  
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    minlength: [5, 'Subject must be at least 5 characters long'],
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    minlength: [10, 'Message must be at least 10 characters long'],
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  
  // Metadata
  status: {
    type: String,
    enum: ['new', 'read', 'in_progress', 'responded', 'closed'],
    default: 'new'
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  }, 
  source: {
    type: String,
    default: 'website_contact_form'
  },
  
  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  },
  
  readAt: {
    type: Date,
    default: null
  },
  
  respondedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
contactFormSchema.index({ email: 1, submittedAt: -1 });
contactFormSchema.index({ status: 1, priority: -1 });
contactFormSchema.index({ submittedAt: -1 });

// Virtual for full name display
contactFormSchema.virtual('displayName').get(function() {
  return this.name;
});

// Pre-save middleware
contactFormSchema.pre('save', function(next) {
  // Only auto-set priority if not manually set to high or urgent
  if (this.isModified('priority') && (this.priority === 'high' || this.priority === 'urgent')) {
    return next();
  }
  const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical'];
  const highKeywords = ['important', 'priority', 'deadline'];
  const text = `${this.subject} ${this.message}`.toLowerCase();
  if (urgentKeywords.some(keyword => text.includes(keyword))) {
    this.priority = 'urgent';
  } else if (highKeywords.some(keyword => text.includes(keyword))) {
    this.priority = 'high';
  }
  next();
});

module.exports = mongoose.model('ContactUs', contactFormSchema);