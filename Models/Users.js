const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {userData} = require('../db');
const userSchema = new Schema({
  name:{
  type:String,
  required:true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.socialLogin.enabled;
    },
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false
  },
  socialLogin: {
    enabled: { type: Boolean, default: false },
    google: {
      id: String,
      email: String
    },
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'suspended', 'deleted'],
      message: '{VALUE} is not a valid status'
    },
    default: 'active',
    index: true
  },
  role: {
    type: String,
    enum: {
      values: ['customer', 'admin'],
      message: '{VALUE} is not a valid role'
    },
    default: 'customer',
    index: true
  },
    lastLogin: Date,
}, {
  timestamps: true,
});
module.exports = userData.model('User', userSchema);