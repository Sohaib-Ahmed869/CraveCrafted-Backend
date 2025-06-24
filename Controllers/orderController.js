const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../Models/Order');
const User = require('../Models/Users');
const Review = require('../Models/Review');

const createOrder = async (req, res) => {
  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      paymentDetails,
      notes
    } = req.body;

    // Enhanced validation checks
    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'No order items provided' 
      });
    }

    if (!shippingAddress || !shippingAddress.address || !shippingAddress.city || 
        !shippingAddress.postalCode) {
      return res.status(400).json({ 
        success: false,
        message: 'Complete shipping address is required' 
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({ 
        success: false,
        message: 'Payment method is required' 
      });
    }

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Total price must be greater than 0' 
      });
    }

    // Validate order items structure
    for (const item of orderItems) {
      if (!item.name || !item.price || !item.quantity || !item.product) {
        return res.status(400).json({ 
          success: false,
          message: 'Each order item must have name, price, quantity, and product ID' 
        });
      }
      if (item.quantity <= 0) {
        return res.status(400).json({ 
          success: false,
          message: 'Order item quantity must be greater than 0' 
        });
      }
    }

    console.log(`Creating order for user: ${req.user._id}, Payment method: ${paymentMethod}`);

    // Determine payment type
    const isCashOnDelivery = ['cash_on_delivery', 'cod'].includes(paymentMethod.toLowerCase());
    
    // Create the order
    const orderData = {
      orderItems,
      user: req.user._id,
      shippingAddress,
      paymentMethod: paymentMethod.toLowerCase(),
      itemsPrice: itemsPrice || 0,
      taxPrice: taxPrice || 0,
      shippingPrice: shippingPrice || 0,
      totalPrice,
      status: 'Pending',
      notes,
      statusHistory: [{
        status: 'Pending',
        timestamp: new Date(),
        note: 'Order placed successfully',
        updatedBy: req.user._id
      }]
    };

    // Set COD details if cash on delivery
    if (isCashOnDelivery) {
      orderData.codDetails = {
        amountToCollect: totalPrice
      };
      orderData.paymentType = 'cash_on_delivery';
    }

    const order = await Order.create(orderData);
    console.log(`Order created with ID: ${order._id}`);

    // Handle different payment methods
    if (isCashOnDelivery) {
      // For Cash on Delivery - automatically confirm order
      order.status = 'Payment_Confirmed';
      order.statusHistory.push({
        status: 'Payment_Confirmed',
        timestamp: new Date(),
        note: 'Cash on delivery order confirmed',
        updatedBy: req.user._id
      });
      await order.save();

      return res.status(201).json({
        success: true,
        message: 'Order placed successfully! Payment will be collected upon delivery.',
        order,
        orderId: order._id
      });

    } else if (['stripe', 'card', 'credit_card', 'debit_card'].includes(paymentMethod.toLowerCase())) {
      // Handle Stripe payment
      if (!paymentDetails) {
        return res.status(400).json({ 
          success: false,
          message: 'Payment details are required for card payments' 
        });
      }

      const { cardNumber, expiryMonth, expiryYear, cvc, cardHolderName } = paymentDetails;

      if (!cardNumber || !expiryMonth || !expiryYear || !cvc) {
        return res.status(400).json({ 
          success: false,
          message: 'Card number, expiry month, expiry year, and CVC are required' 
        });
      }

      try {
        console.log('Processing Stripe payment...');
        
        const user = await User.findById(req.user._id);

        // Map test card numbers to payment method IDs
        const testPaymentMethods = {
          '4242424242424242': 'pm_card_visa',
          '5555555555554444': 'pm_card_mastercard',
          '378282246310005': 'pm_card_amex',
          '6011111111111117': 'pm_card_discover'
        };

        const cleanCardNumber = cardNumber.replace(/\s/g, '');
        const paymentMethodId = testPaymentMethods[cleanCardNumber] || 'pm_card_visa';
        
        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalPrice * 100),
          currency: process.env.STRIPE_CURRENCY || 'usd',
          payment_method: paymentMethodId,
          confirmation_method: 'manual',
          confirm: true,
          return_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/order-success`,
          metadata: {
            orderId: order._id.toString(),
            userId: req.user._id.toString(),
            userEmail: user?.email || '',
            cardLast4: cleanCardNumber.slice(-4),
          },
          description: `Order #${order._id} - ${orderItems.length} items`,
          shipping: {
            name: cardHolderName || user?.name || 'Customer',
            address: {
              line1: shippingAddress.address,
              city: shippingAddress.city,
              postal_code: shippingAddress.postalCode,
              country: shippingAddress.country || 'US',
            },
          },
        });

        console.log(`Payment Intent created: ${paymentIntent.id}, Status: ${paymentIntent.status}`);

        // Update order with payment details
        order.paymentIntent = {
          id: paymentIntent.id,
          status: paymentIntent.status,
          clientSecret: paymentIntent.client_secret,
        };

        // Handle payment status
        if (paymentIntent.status === 'succeeded') {
          order.isPaid = true;
          order.paidAt = new Date();
          order.status = 'Payment_Confirmed';
          order.statusHistory.push({
            status: 'Payment_Confirmed',
            timestamp: new Date(),
            note: 'Online payment completed successfully',
            updatedBy: req.user._id
          });
          order.paymentResult = {
            id: paymentIntent.id,
            status: paymentIntent.status,
            updateTime: new Date().toISOString(),
            emailAddress: user?.email || '',
          };

          await order.save();

          return res.status(201).json({
            success: true,
            message: 'Order created and payment completed successfully!',
            order,
            orderId: order._id,
            payment: {
              status: 'succeeded',
              paymentIntentId: paymentIntent.id,
              amount: totalPrice,
              cardLast4: cleanCardNumber.slice(-4),
            }
          });

        } else if (paymentIntent.status === 'requires_action') {
          await order.save();

          return res.status(201).json({
            success: true,
            message: 'Order created, additional authentication required',
            order,
            orderId: order._id,
            payment: {
              status: 'requires_action',
              paymentIntentId: paymentIntent.id,
              clientSecret: paymentIntent.client_secret,
              nextAction: paymentIntent.next_action,
            }
          });

        } else {
          order.statusHistory.push({
            status: 'Payment_Failed',
            timestamp: new Date(),
            note: 'Payment was declined or failed',
            updatedBy: req.user._id
          });
          order.paymentIntent.status = paymentIntent.status;
          await order.save();

          return res.status(400).json({
            success: false,
            message: 'Payment failed',
            orderId: order._id,
            payment: {
              status: paymentIntent.status,
              error: 'Payment was declined or failed',
              cardLast4: cleanCardNumber.slice(-4),
            }
          });
        }

      } catch (stripeError) {
        console.error('Stripe payment processing error:', stripeError);
        
        order.statusHistory.push({
          status: 'Payment_Failed',
          timestamp: new Date(),
          note: `Payment processing error: ${stripeError.message}`,
          updatedBy: req.user._id
        });
        order.paymentIntent = { error: stripeError.message };
        await order.save();
        
        let userMessage = 'Payment processing failed';
        let errorDetails = {};

        if (stripeError.type === 'StripeCardError') {
          userMessage = 'Your card was declined';
          errorDetails = {
            code: stripeError.code,
            decline_code: stripeError.decline_code,
            message: stripeError.message,
          };
        } else if (stripeError.type === 'StripeInvalidRequestError') {
          userMessage = 'Payment configuration error';
          errorDetails = { message: 'Please try again or contact support' };
        }
        
        return res.status(400).json({
          success: false,
          message: userMessage,
          error: stripeError.message,
          orderId: order._id,
          details: errorDetails
        });
      }
    } else {
      // For other payment methods
      console.log(`Order created with payment method: ${paymentMethod}`);
      return res.status(201).json({
        success: true,
        message: 'Order created successfully. Please complete payment.',
        order,
        orderId: order._id
      });
    }

  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error while creating order',
      error: error.message 
    });
  }
};

// Create payment intent (separate endpoint for frontend)
const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'usd', orderData } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    if (!orderData) {
      return res.status(400).json({
        success: false,
        message: 'Order data is required'
      });
    }

    // Create payment intent without confirming
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId: req.user._id.toString(),
        userEmail: req.user.email || '',
      },
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment intent',
      error: error.message
    });
  }
};

// Confirm payment and create order
const confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, orderData } = req.body;

    if (!paymentIntentId || !orderData) {
      return res.status(400).json({
        success: false,
        message: 'Payment Intent ID and order data are required'
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment has not been completed successfully'
      });
    }

    // Create the order
    const order = await Order.create({
      ...orderData,
      user: req.user._id,
      isPaid: true,
      paidAt: new Date(),
      status: 'Payment_Confirmed',
      paymentResult: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        updateTime: new Date().toISOString(),
        emailAddress: req.user.email || '',
      },
      statusHistory: [{
        status: 'Pending',
        timestamp: new Date(),
        note: 'Order placed successfully',
        updatedBy: req.user._id
      }, {
        status: 'Payment_Confirmed',
        timestamp: new Date(),
        note: 'Payment confirmed successfully',
        updatedBy: req.user._id
      }]
    });

    console.log(`Order confirmed with payment: ${order._id}`);

    res.json({
      success: true,
      message: 'Order created and payment confirmed successfully',
      order,
      orderId: order._id
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming payment',
      error: error.message
    });
  }
};

// Get orders with enhanced filtering
const getOrders = async (req, res) => {
  try {
    console.log('Admin fetching all orders...');
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    const paymentType = req.query.paymentType;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    // Build filter object
    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (paymentType && paymentType !== 'all') {
      filter.paymentType = paymentType;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const totalOrders = await Order.countDocuments(filter);
    
    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`Found ${orders.length} orders out of ${totalOrders} total`);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPrevPage: page > 1,
      },
    });

  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching orders',
      error: error.message 
    });
  }
};

// Get user's orders
const getMyOrders = async (req, res) => {
  try {
    console.log(`Fetching orders for user: ${req.user._id}`);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    
    let filter = { user: req.user._id };
    if (status && status !== 'all') {
      filter.status = status;
    }

    const totalOrders = await Order.countDocuments(filter);
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // For each order, check if there are reviews for specific order-product combinations
    for (let order of orders) {
      if (Array.isArray(order.orderItems)) {
        for (let item of order.orderItems) {
          // Check if there's a review for this specific order + product combination
          const review = await Review.findOne({
            userId: req.user._id,
            productId: item.product,
            orderId: order._id
          }).lean();
          
          // Set reviewGiven based on whether a review exists for THIS specific order
          item.reviewGiven = !!review;
          item.review = review || null;
        }
      }
    }

    console.log(`Found ${orders.length} orders for user`);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPrevPage: page > 1,
      },
    });
    
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching your orders',
      error: error.message
    });
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    console.log('Fetching order with ID:', req.params.id);

    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid order ID format' 
      });
    }

    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('orderItems.product', 'name image')
      .populate('statusHistory.updatedBy', 'name');

    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Check authorization
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view this order' 
      });
    }

    console.log('Order found and authorized');

    res.json({
      success: true,
      order: {
        ...order.toObject(),
        trackingStage: order.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error getting order by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
// Enhanced update order status with tracking
const updateOrderStatus = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ 
        success: false,
        message: 'Request body is required' 
      });
    }

    const { status, note, trackingNumber, courier, estimatedDeliveryDate } = req.body;
    const validStatuses = [
      'Pending', 'Payment_Confirmed', 'Processing', 'Ready_to_Ship', 
      'Shipped', 'Out_for_Delivery', 'Delivered', 'Cancelled', 
      'Payment_Failed', 'Returned', 'Refunded'
    ];

    if (!status) {
      return res.status(400).json({ 
        success: false,
        message: 'Status is required' 
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: `Invalid status. Valid statuses are: ${validStatuses.join(', ')}` 
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Add status to history
    order.addStatusToHistory(status, note || `Status updated to ${status}`, req.user._id);

    // Update specific fields based on status
    if (status === 'Delivered' && !order.isDelivered) {
      order.isDelivered = true;
      order.deliveredAt = new Date();
      
      // Mark COD as collected if cash on delivery
      if (order.paymentType === 'cash_on_delivery' && !order.isPaid) {
        order.isPaid = true;
        order.paidAt = new Date();
        order.codDetails.collectedAmount = order.codDetails.amountToCollect;
        order.codDetails.collectedAt = new Date();
        order.codDetails.collectedBy = req.body.deliveredBy || 'Delivery Team';
      }
    }

    // Update tracking information if provided
    if (trackingNumber) order.tracking.trackingNumber = trackingNumber;
    if (courier) order.tracking.courier = courier;
    if (estimatedDeliveryDate) order.tracking.estimatedDeliveryDate = new Date(estimatedDeliveryDate);

    const updatedOrder = await order.save();

    console.log(`Order ${order._id} status updated to: ${status}`);

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: {
        ...updatedOrder.toObject(),
        trackingStage: updatedOrder.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating order status',
      error: error.message 
    });
  }
};

// Confirm COD payment collection
const confirmCODPayment = async (req, res) => {
  try {
    const { collectedAmount, collectedBy } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    if (order.paymentType !== 'cash_on_delivery') {
      return res.status(400).json({ 
        success: false,
        message: 'This is not a cash on delivery order' 
      });
    }

    if (order.isPaid) {
      return res.status(400).json({ 
        success: false,
        message: 'Payment already confirmed for this order' 
      });
    }

    // Update payment details
    order.isPaid = true;
    order.paidAt = new Date();
    order.codDetails.collectedAmount = collectedAmount || order.codDetails.amountToCollect;
    order.codDetails.collectedAt = new Date();
    order.codDetails.collectedBy = collectedBy || 'Delivery Team';
    
    order.addStatusToHistory('Delivered', 'COD payment collected and order delivered', req.user._id);

    const updatedOrder = await order.save();

    res.json({
      success: true,
      message: 'COD payment confirmed successfully',
      order: {
        ...updatedOrder.toObject(),
        trackingStage: updatedOrder.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error confirming COD payment:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error confirming COD payment',
      error: error.message 
    });
  }
};

// Get order tracking info for frontend
const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', '_id name email')
      .populate('statusHistory.updatedBy', 'name')
      .select('status statusHistory tracking paymentType totalPrice codDetails user');

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Check authorization with proper null checks
    if (!order.user || !order.user._id) {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid order user data' 
      });
    }

    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view this order tracking' 
      });
    }

    // Get tracking stage information
    const trackingInfo = order.getTrackingStage();

    // Format the response to match frontend expectations
    res.json({
      success: true,
      tracking: {
        ...trackingInfo,
        orderId: order._id,
        currentStatus: order.status,
        paymentType: order.paymentType,
        trackingDetails: {
          trackingNumber: order.tracking?.trackingNumber || '',
          courier: order.tracking?.courier || '',
          estimatedDeliveryDate: order.tracking?.estimatedDeliveryDate || '',
          trackingUrl: order.tracking?.trackingUrl || '',
          currentLocation: order.tracking?.currentLocation || '',
          notes: order.tracking?.notes || ''
        },
        statusHistory: order.statusHistory.map(history => ({
          status: history.status,
          timestamp: history.timestamp,
          note: history.note,
          updatedBy: history.updatedBy
        })),
        codDetails: order.paymentType === 'cash_on_delivery' ? order.codDetails : null
      }
    });

  } catch (error) {
    console.error('Error getting order tracking:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching order tracking',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Confirm Stripe payment (existing function with tracking enhancement)
const confirmStripePayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ 
        success: false,
        message: 'Payment Intent ID is required' 
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    if (order.paymentIntent?.id !== paymentIntentId) {
      return res.status(400).json({ 
        success: false,
        message: 'Payment Intent does not match this order' 
      });
    }

    if (paymentIntent.status === 'succeeded') {
      order.isPaid = true;
      order.paidAt = new Date();
      order.addStatusToHistory('Payment_Confirmed', 'Stripe payment confirmed successfully', req.user._id);
      order.paymentResult = {
        id: paymentIntent.id,
        status: paymentIntent.status,
        updateTime: new Date().toISOString(),
        emailAddress: req.user.email,
      };
      order.paymentIntent.status = paymentIntent.status;

      await order.save();

      console.log(`Stripe payment confirmed for order: ${order._id}`);

      res.json({
        success: true,
        message: 'Payment confirmed successfully',
        order: {
          ...order.toObject(),
          trackingStage: order.getTrackingStage()
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not successful',
        status: paymentIntent.status,
      });
    }

  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error confirming payment',
      error: error.message 
    });
  }
};

// Enhanced webhook handler with tracking
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Stripe webhook event: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      const orderId = paymentIntent.metadata.orderId;

      try {
        const order = await Order.findById(orderId);
        if (order && !order.isPaid) {
          order.isPaid = true;
          order.paidAt = new Date();
          order.addStatusToHistory('Payment_Confirmed', 'Payment confirmed via Stripe webhook');
          order.paymentResult = {
            id: paymentIntent.id,
            status: paymentIntent.status,
            updateTime: new Date().toISOString(),
          };
          order.paymentIntent.status = paymentIntent.status;
          await order.save();
          console.log(`Order ${orderId} marked as paid via webhook`);
        }
      } catch (error) {
        console.error('Error updating order after payment success:', error);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      const failedOrderId = failedPayment.metadata.orderId;

      try {
        const order = await Order.findById(failedOrderId);
        if (order) {
          order.addStatusToHistory('Payment_Failed', 'Payment failed via Stripe webhook');
          order.paymentIntent.status = failedPayment.status;
          await order.save();
          console.log(`Order ${failedOrderId} marked as payment failed via webhook`);
        }
      } catch (error) {
        console.error('Error updating order after payment failure:', error);
      }
      break;

    case 'payment_intent.canceled':
      const canceledPayment = event.data.object;
      const canceledOrderId = canceledPayment.metadata.orderId;

      try {
        const order = await Order.findById(canceledOrderId);
        if (order) {
          order.addStatusToHistory('Cancelled', 'Payment cancelled via Stripe webhook');
          order.paymentIntent.status = canceledPayment.status;
          await order.save();
          console.log(`Order ${canceledOrderId} cancelled via webhook`);
        }
      } catch (error) {
        console.error('Error updating order after payment cancellation:', error);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};

// Enhanced cancel order with tracking
const cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Check authorization
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to cancel this order' 
      });
    }

    // Check if order can be cancelled
    if (['Shipped', 'Out_for_Delivery', 'Delivered'].includes(order.status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot cancel shipped, out for delivery, or delivered orders' 
      });
    }

    // Cancel Stripe payment intent if exists and not paid
    if (order.paymentIntent?.id && !order.isPaid) {
      try {
        await stripe.paymentIntents.cancel(order.paymentIntent.id);
        console.log(`Cancelled Stripe payment intent: ${order.paymentIntent.id}`);
      } catch (stripeError) {
        console.error('Error cancelling Stripe payment intent:', stripeError);
      }
    }

    // Update order with cancellation details
    order.addStatusToHistory('Cancelled', reason || 'Order cancelled by user', req.user._id);
    order.cancellationReason = reason;
    order.cancelledBy = req.user._id;
    order.cancelledAt = new Date();

    const updatedOrder = await order.save();

    console.log(`Order ${order._id} cancelled`);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: {
        ...updatedOrder.toObject(),
        trackingStage: updatedOrder.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error cancelling order',
      error: error.message 
    });
  }
};

// Enhanced delete order
const deleteOrder = async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid order ID format' 
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Check if order can be deleted
    if (!['Cancelled', 'Payment_Failed', 'Refunded'].includes(order.status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Only cancelled, failed, or refunded orders can be deleted' 
      });
    }

    // Cancel Stripe payment intent if exists
    if (order.paymentIntent?.id && !order.isPaid) {
      try {
        await stripe.paymentIntents.cancel(order.paymentIntent.id);
        console.log(`Cancelled Stripe payment intent: ${order.paymentIntent.id}`);
      } catch (stripeError) {
        console.error('Error cancelling Stripe payment intent:', stripeError);
      }
    }

    await Order.deleteOne({ _id: req.params.id });

    console.log(`Order ${req.params.id} deleted successfully`);

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting order',
      error: error.message 
    });
  }
};

// New function: Initiate return request
const initiateReturn = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Check authorization
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to return this order' 
      });
    }

    // Check if order can be returned
    if (order.status !== 'Delivered') {
      return res.status(400).json({ 
        success: false,
        message: 'Only delivered orders can be returned' 
      });
    }

    // Check return window (e.g., 30 days)
    const deliveryDate = new Date(order.deliveredAt);
    const currentDate = new Date();
    const daysDifference = Math.floor((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));
    
    if (daysDifference > 30) {
      return res.status(400).json({ 
        success: false,
        message: 'Return window has expired. Returns are only accepted within 30 days of delivery.' 
      });
    }

    order.addStatusToHistory('Returned', `Return requested: ${reason}`, req.user._id);
    order.returnReason = reason;
    order.returnRequestedAt = new Date();

    const updatedOrder = await order.save();

    res.json({
      success: true,
      message: 'Return request initiated successfully',
      order: {
        ...updatedOrder.toObject(),
        trackingStage: updatedOrder.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error initiating return:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error initiating return',
      error: error.message 
    });
  }
};

// New function: Update tracking details
const updateTracking = async (req, res) => {
  try {
    const { trackingNumber, courier, estimatedDeliveryDate, trackingUrl } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Update tracking information
    if (trackingNumber) order.tracking.trackingNumber = trackingNumber;
    if (courier) order.tracking.courier = courier;
    if (estimatedDeliveryDate) order.tracking.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
    if (trackingUrl) order.tracking.trackingUrl = trackingUrl;

    const updatedOrder = await order.save();

    res.json({
      success: true,
      message: 'Tracking information updated successfully',
      tracking: updatedOrder.tracking
    });

  } catch (error) {
    console.error('Error updating tracking:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating tracking information',
      error: error.message 
    });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  confirmStripePayment,
  handleStripeWebhook,
  cancelOrder,
  deleteOrder,
  confirmCODPayment,
  getOrderTracking,
  initiateReturn,
  updateTracking,
  createPaymentIntent,
  confirmPayment
};