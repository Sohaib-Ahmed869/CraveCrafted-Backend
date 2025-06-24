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
      enum: ['stripe', 'card', 'credit_card', 'debit_card', 'cash_on_delivery', 'cod', 'paypal', 'bank_transfer'],
    },
    
    // Enhanced payment type categorization
    paymentType: {
      type: String,
      required: true,
      enum: ['online', 'cash_on_delivery'],
      default: function() {
        return ['cash_on_delivery', 'cod'].includes(this.paymentMethod?.toLowerCase()) 
          ? 'cash_on_delivery' 
          : 'online';
      }
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
        'Payment_Confirmed', // Payment confirmed (for online) or order confirmed (for COD)
        'Processing',        // Order being prepared/packed
        'Ready_to_Ship',     // Order packed and ready for pickup by courier
        'Shipped',           // Order picked up by courier and in transit
        'Out_for_Delivery',  // Order is out for final delivery
        'Delivered',         // Order successfully delivered
        'Cancelled',         // Order cancelled
        'Payment_Failed',    // Payment failed (for online payments)
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

    // Special handling for cash on delivery
    codDetails: {
      amountToCollect: { type: Number },
      collectedAmount: { type: Number },
      collectedAt: { type: Date },
      collectedBy: { type: String }, // Delivery person name/ID
    },

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

// Pre-save middleware to automatically set paymentType
orderSchema.pre('save', function(next) {
  if (this.isModified('paymentMethod')) {
    this.paymentType = ['cash_on_delivery', 'cod'].includes(this.paymentMethod?.toLowerCase()) 
      ? 'cash_on_delivery' 
      : 'online';
  }
  
  // Set COD amount if payment type is cash on delivery
  if (this.paymentType === 'cash_on_delivery' && !this.codDetails.amountToCollect) {
    this.codDetails.amountToCollect = this.totalPrice;
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

// Instance method to get current tracking stage for frontend
orderSchema.methods.getTrackingStage = function() {
  const stages = [
    { key: 'placed', label: 'Order Placed', statuses: ['Pending'] },
    { key: 'confirmed', label: 'Order Confirmed', statuses: ['Payment_Confirmed'] },
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

// Static method to get orders by status
orderSchema.statics.getOrdersByStatus = function(status) {
  return this.find({ status }).populate('user', 'name email').sort({ createdAt: -1 });
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;