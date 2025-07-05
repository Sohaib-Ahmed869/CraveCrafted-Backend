const mongoose = require('mongoose');

const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    orderItems: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: 'Product',
        },
      },
    ],
    shippingAddress: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['stripe', 'card', 'credit_card', 'debit_card'],
      default: 'stripe'
    },
    
    // Payment type (only online now)
    paymentType: {
      type: String,
      required: true,
      enum: ['online'],
      default: 'online'
    },

    // Subscription and recurring fields
    isSubscription: {
      type: Boolean,
      default: false
    },
    subscriptionType: {
      type: String,
      enum: ['basic', 'premium', 'custom'],
      default: null
    },
    subscriptionName: {
      type: String,
      default: null
    },
    subscriptionPrice: {
      type: Number,
      default: 0
    },
    maxProducts: {
      type: Number,
      default: 0
    },
    recurrence: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly', 'quarterly'],
      default: null
    },
    recurrenceLabel: {
      type: String,
      default: null
    },
    selectedProducts: [{
      _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      title: { type: String },
      description: { type: String },
      imageUrl: { type: String },
      price: { type: Number },
      quantity: { type: Number }
    }],
    nextBillingDate: {
      type: Date,
      default: null
    },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'paused', 'cancelled', 'expired', 'payment_failed'],
      default: 'active'
    },
    billingCycle: {
      type: Number,
      default: 1 // Number of intervals between charges
    },
    totalBillingCycles: {
      type: Number,
      default: null // null for unlimited, or specific number
    },
    currentBillingCycle: {
      type: Number,
      default: 1
    },

    // Stripe-specific fields
    stripeSubscriptionId: {
      type: String,
      default: null
    },
    stripeCustomerId: {
      type: String,
      default: null
    },
    stripePriceId: {
      type: String,
      default: null
    },

    // Stripe payment fields
    paymentIntent: {
      id: { type: String },
      status: { type: String },
      clientSecret: { type: String },
      error: { type: String },
    },
    paymentResult: {
      id: { type: String },
      status: { type: String },
      updateTime: { type: String },
      emailAddress: { type: String },
    },

    // Payment history for subscriptions
    paymentHistory: [{
      paymentId: { type: String }, // Stripe payment intent or invoice ID
      amount: { type: Number, required: true },
      currency: { type: String, default: 'usd' },
      status: { type: String, required: true }, // 'succeeded', 'failed', 'pending'
      billingCycle: { type: Number }, // Which billing cycle this payment is for
      paidAt: { type: Date, default: Date.now },
      stripeInvoiceId: { type: String }, // For subscription payments
      stripePaymentIntentId: { type: String }, // For one-time payments
      failureReason: { type: String }, // If payment failed
      metadata: { type: mongoose.Schema.Types.Mixed } // Additional payment data
    }],

    // Price breakdown
    itemsPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    taxPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },

    // Payment status
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    paidAt: {
      type: Date,
    },

    // Delivery status
    isDelivered: {
      type: Boolean,
      required: true,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },

    // Main order status
    status: {
      type: String,
      required: true,
      enum: [
        'Pending',           // Order placed, awaiting payment confirmation
        'Payment_Confirmed', // Payment confirmed
        'Processing',        // Order being prepared/packed
        'Ready_to_Ship',     // Order packed and ready for pickup by courier
        'Shipped',           // Order picked up by courier and in transit
        'Out_for_Delivery',  // Order is out for final delivery
        'Delivered',         // Order successfully delivered
        'Cancelled',         // Order cancelled
        'Payment_Failed',    // Payment failed
        'Returned',          // Order returned by customer
        'Refunded'           // Order refunded
      ],
      default: 'Pending',
    },

    // Detailed tracking information
    tracking: {
      trackingNumber: { type: String },
      courier: { type: String }, // e.g., 'FedEx', 'UPS', 'DHL', 'Local Delivery'
      estimatedDeliveryDate: { type: Date },
      trackingUrl: { type: String },
      currentLocation: { type: String },
      notes: { type: String }
    },

    // Timeline tracking for frontend display
    statusHistory: [{
      status: {
        type: String,
        required: true,
        enum: [
          'Pending',
          'Payment_Confirmed',
          'Processing',
          'Ready_to_Ship',
          'Shipped',
          'Out_for_Delivery',
          'Delivered',
          'Cancelled',
          'Payment_Failed',
          'Returned',
          'Refunded'
        ]
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      note: { type: String }, // Optional note for each status change
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],

    // Cancellation details
    cancellationReason: { type: String },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancelledAt: { type: Date },

    // Return/Refund details
    returnReason: { type: String },
    returnRequestedAt: { type: Date },
    refundAmount: { type: Number },
    refundedAt: { type: Date },

    // Additional notes
    notes: { type: String },
    adminNotes: { type: String }, // Internal notes for admin
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware for subscription billing dates
orderSchema.pre('save', function(next) {
  // Set next billing date for new subscriptions
  if (this.isSubscription && this.isNew && !this.nextBillingDate) {
    const now = new Date();
    const billingCycle = this.billingCycle || 1;
    
    switch (this.recurrence) {
      case 'weekly':
        this.nextBillingDate = new Date(now.getTime() + (7 * billingCycle * 24 * 60 * 60 * 1000));
        break;
      case 'biweekly':
        this.nextBillingDate = new Date(now.getTime() + (14 * billingCycle * 24 * 60 * 60 * 1000));
        break;
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + billingCycle);
        this.nextBillingDate = nextMonth;
        break;
      case 'quarterly':
        const nextQuarter = new Date(now);
        nextQuarter.setMonth(nextQuarter.getMonth() + (3 * billingCycle));
        this.nextBillingDate = nextQuarter;
        break;
    }
  }
  
  next();
});

// Instance method to add status to history
orderSchema.methods.addStatusToHistory = function(status, note = '', updatedBy = null) {
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    note,
    updatedBy
  });
  this.status = status;
};

// Instance method to add payment to history
orderSchema.methods.addPaymentToHistory = function(paymentData) {
  this.paymentHistory.push({
    paymentId: paymentData.paymentId,
    amount: paymentData.amount,
    currency: paymentData.currency || 'usd',
    status: paymentData.status,
    billingCycle: paymentData.billingCycle || this.currentBillingCycle,
    paidAt: paymentData.paidAt || new Date(),
    stripeInvoiceId: paymentData.stripeInvoiceId,
    stripePaymentIntentId: paymentData.stripePaymentIntentId,
    failureReason: paymentData.failureReason,
    metadata: paymentData.metadata || {}
  });
};

// Instance method to get current tracking stage for frontend
orderSchema.methods.getTrackingStage = function() {
  const stages = [
    { key: 'placed', label: 'Order Placed', statuses: ['Pending'] },
    { key: 'confirmed', label: 'Payment Confirmed', statuses: ['Payment_Confirmed'] },
    { key: 'processing', label: 'Processing', statuses: ['Processing'] },
    { key: 'ready', label: 'Ready to Ship', statuses: ['Ready_to_Ship'] },
    { key: 'shipped', label: 'Shipped', statuses: ['Shipped'] },
    { key: 'out_for_delivery', label: 'Out for Delivery', statuses: ['Out_for_Delivery'] },
    { key: 'delivered', label: 'Delivered', statuses: ['Delivered'] }
  ];

  const currentStageIndex = stages.findIndex(stage => 
    stage.statuses.includes(this.status)
  );

  return {
    currentStage: currentStageIndex >= 0 ? stages[currentStageIndex] : null,
    currentStageIndex: currentStageIndex >= 0 ? currentStageIndex : 0,
    totalStages: stages.length,
    stages: stages.map((stage, index) => ({
      ...stage,
      completed: index <= currentStageIndex,
      current: index === currentStageIndex
    }))
  };
};

// Instance method to check if subscription should be billed (now handled by Stripe)
orderSchema.methods.shouldProcessBilling = function() {
  if (!this.isSubscription || this.subscriptionStatus !== 'active') {
    return false;
  }

  // Stripe handles the billing automatically
  // This method can be used for internal tracking
  const now = new Date();
  return this.nextBillingDate && now >= this.nextBillingDate;
};

// Instance method to update next billing date
orderSchema.methods.updateNextBillingDate = function() {
  if (!this.isSubscription) {
    return false;
  }

  const billingCycle = this.billingCycle || 1;
  const currentDate = this.nextBillingDate || new Date();

  switch (this.recurrence) {
    case 'weekly':
      this.nextBillingDate = new Date(currentDate.getTime() + (7 * billingCycle * 24 * 60 * 60 * 1000));
      break;
    case 'biweekly':
      this.nextBillingDate = new Date(currentDate.getTime() + (14 * billingCycle * 24 * 60 * 60 * 1000));
      break;
    case 'monthly':
      const nextMonth = new Date(currentDate);
      nextMonth.setMonth(nextMonth.getMonth() + billingCycle);
      this.nextBillingDate = nextMonth;
      break;
    case 'quarterly':
      const nextQuarter = new Date(currentDate);
      nextQuarter.setMonth(nextQuarter.getMonth() + (3 * billingCycle));
      this.nextBillingDate = nextQuarter;
      break;
  }

  this.currentBillingCycle += 1;

  // Check if subscription has reached its limit
  if (this.totalBillingCycles && this.currentBillingCycle > this.totalBillingCycles) {
    this.subscriptionStatus = 'expired';
    return false;
  }

  return true;
};

// Static method to get orders by status
orderSchema.statics.getOrdersByStatus = function(status) {
  return this.find({ status }).populate('user', 'name email').sort({ createdAt: -1 });
};

// Static method to get active subscriptions
orderSchema.statics.getActiveSubscriptions = async function() {
  try {
    return await this.find({ 
      isSubscription: true, 
      subscriptionStatus: 'active' 
    }).populate('user', 'name email').sort({ nextBillingDate: 1 });
  } catch (error) {
    console.error('Error in getActiveSubscriptions:', error);
    throw error;
  }
};

// Static method to get subscription revenue analytics
orderSchema.statics.getSubscriptionRevenue = async function(startDate, endDate) {
  try {
    const matchConditions = {
      isSubscription: true,
      isPaid: true
    };

    if (startDate || endDate) {
      matchConditions.createdAt = {};
      if (startDate) matchConditions.createdAt.$gte = new Date(startDate);
      if (endDate) matchConditions.createdAt.$lte = new Date(endDate);
    }

    return await this.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalRevenue: { $sum: '$totalPrice' },
          orderCount: { $sum: 1 },
          averageOrderValue: { $avg: '$totalPrice' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);
  } catch (error) {
    console.error('Error in getSubscriptionRevenue:', error);
    throw error;
  }
};

// Virtual for subscription billing info
orderSchema.virtual('billingInfo').get(function() {
  if (!this.isSubscription) return null;
  
  return {
    nextBillingDate: this.nextBillingDate,
    currentCycle: this.currentBillingCycle,
    totalCycles: this.totalBillingCycles,
    subscriptionStatus: this.subscriptionStatus,
    isUnlimited: !this.totalBillingCycles,
    remainingCycles: this.totalBillingCycles ? 
      Math.max(0, this.totalBillingCycles - this.currentBillingCycle) : 
      null
  };
});

// Index for efficient queries
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ isSubscription: 1, subscriptionStatus: 1 });
orderSchema.index({ stripeSubscriptionId: 1 });
orderSchema.index({ nextBillingDate: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;