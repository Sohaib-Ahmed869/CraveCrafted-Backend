const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Schema = mongoose.Schema;
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.socialLogin.enabled;
    },
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'customer'],
    default: 'user'
  },
  isTemporaryPassword: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
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
    enum: ['active', 'inactive', 'suspended', 'deleted'],
    default: 'active'
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  phone: {
    type: String,
    trim: true
  },
  addresses: [
    {
      _id: { type: Schema.Types.ObjectId, auto: true },
      name: { type: String, required: true },
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
      isDefault: { type: Boolean, default: false }
    }
  ],
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  dateOfBirth: { type: Date },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say', ''],
    default: ''
  },
  dietaryPreferences: [{ type: String, trim: true }],
  allergies: [{ type: String, trim: true }],
}, {
  timestamps: true
});

// Generate and hash password reset token
userSchema.methods.getResetPasswordToken = function() {
  console.log('Generating reset token for user:', this.email);
  
  const resetToken = crypto.randomBytes(20).toString('hex');
  console.log('Reset token generated');
 
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  console.log('Reset token hashed');
 
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  console.log('Reset token expiration set to:', new Date(this.resetPasswordExpire));
 
  return resetToken;
};

// FIXED: Hash password before saving - Only when password is actually modified
userSchema.pre('save', async function(next) {
  // Only hash if password is being modified AND it's not already hashed
  if (!this.isModified('password')) {
    console.log('Password not modified, skipping hash');
    return next();
  }
  
  // Check if password is already hashed (starts with $2a, $2b, $2x, $2y)
  if (this.password && this.password.match(/^\$2[abxy]\$/)) {
    console.log('Password already hashed, skipping hash');
    return next();
  }
  
  try {
    console.log('Hashing password for user:', this.email);
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    console.log('Password hashed successfully');
    next();
  } catch (error) {
    console.error('Error hashing password:', error);
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    console.log('comparePassword called');
    
    let passwordToCompare = this.password;
    
    if (!passwordToCompare) {
      console.log('Password not in current document, fetching...');
      const userWithPassword = await this.constructor.findById(this._id).select('+password');
      if (!userWithPassword || !userWithPassword.password) {
        console.log('No password found for user');
        return false;
      }
      passwordToCompare = userWithPassword.password;
    }
    
    console.log('Password hash to compare against:', passwordToCompare.substring(0, 20) + '...');
    console.log('Candidate password length:', candidatePassword.length);
    
    const result = await bcrypt.compare(candidatePassword, passwordToCompare);
    console.log('Password comparison result:', result);
    return result;
    
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

// Method to generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      role: this.role 
    },
    process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    { 
      expiresIn: '30d' 
    }
  );
};

module.exports = mongoose.model('User', userSchema);