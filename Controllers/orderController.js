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
      notes,
      // Subscription fields
      isSubscription,
      subscriptionType,
      subscriptionName,
      subscriptionPrice,
      maxProducts,
      recurrence,
      recurrenceLabel,
      selectedProducts,
      billingCycle,
      totalBillingCycles
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

    if (!paymentMethod || !['stripe', 'card'].includes(paymentMethod.toLowerCase())) {
      return res.status(400).json({ 
        success: false,
        message: 'Only Stripe/Card payment method is supported' 
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

    // Validate subscription fields if it's a subscription order
    if (isSubscription) {
      if (!subscriptionType || !subscriptionName || !recurrence) {
        return res.status(400).json({ 
          success: false,
          message: 'Subscription type, name, and recurrence are required for subscription orders' 
        });
      }
    }

    if (!paymentDetails) {
      return res.status(400).json({ 
        success: false,
        message: 'Payment details are required' 
      });
    }

    const { cardNumber, expiryMonth, expiryYear, cvc, cardHolderName } = paymentDetails;

    if (!cardNumber || !expiryMonth || !expiryYear || !cvc) {
      return res.status(400).json({ 
        success: false,
        message: 'Card number, expiry month, expiry year, and CVC are required' 
      });
    }

    console.log(`Creating ${isSubscription ? 'subscription' : 'one-time'} order for user: ${req.user._id}`);

    const user = await User.findById(req.user._id);

    try {
      if (isSubscription) {
        // Handle Subscription Order with Stripe Subscription
        return await createSubscriptionOrder(req, res, {
          orderItems, shippingAddress, paymentMethod, itemsPrice, taxPrice,
          shippingPrice, totalPrice, paymentDetails, notes, subscriptionType,
          subscriptionName, subscriptionPrice, maxProducts, recurrence,
          recurrenceLabel, selectedProducts, billingCycle, totalBillingCycles, user
        });
      } else {
        // Handle One-time Order with Stripe Payment Intent
        return await createOneTimeOrder(req, res, {
          orderItems, shippingAddress, paymentMethod, itemsPrice, taxPrice,
          shippingPrice, totalPrice, paymentDetails, notes, user
        });
      }
    } catch (stripeError) {
      console.error('Stripe payment processing error:', stripeError);
      
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
        details: errorDetails
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

// Get subscription analytics (admin only)
const getSubscriptionAnalytics = async (req, res) => {
  try {
    const totalSubscriptions = await Order.countDocuments({ isSubscription: true });
    const activeSubscriptions = await Order.countDocuments({ 
      isSubscription: true, 
      subscriptionStatus: 'active' 
    });
    const pausedSubscriptions = await Order.countDocuments({ 
      isSubscription: true, 
      subscriptionStatus: 'paused' 
    });
    const cancelledSubscriptions = await Order.countDocuments({ 
      isSubscription: true, 
      subscriptionStatus: 'cancelled' 
    });

    // Get revenue analytics
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          isSubscription: true,
          isPaid: true,
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalPrice' },
          averageOrderValue: { $avg: '$totalPrice' }
        }
      }
    ]);

    // Get subscription types distribution
    const subscriptionTypes = await Order.aggregate([
      {
        $match: { isSubscription: true }
      },
      {
        $group: {
          _id: '$subscriptionType',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      analytics: {
        totalSubscriptions,
        activeSubscriptions,
        pausedSubscriptions,
        cancelledSubscriptions,
        monthlyRevenue: monthlyRevenue[0] || { totalRevenue: 0, averageOrderValue: 0 },
        subscriptionTypes
      }
    });

  } catch (error) {
    console.error('Error getting subscription analytics:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching subscription analytics',
      error: error.message 
    });
  }
};

// Create Stripe Subscription for recurring billing
const createStripeSubscription = async (req, res) => {
  try {
    const { email, name, priceId, paymentMethodId } = req.body;

    // Validate required fields
    if (!email || !name || !priceId || !paymentMethodId) {
      return res.status(400).json({
        error: 'Missing required fields: email, name, priceId, and paymentMethodId are required'
      });
    }

    // 1. Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        name,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId }
      });
    }

    // 2. Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    // 3. Return client secret for first payment
    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
      status: subscription.status,
    });
  } catch (error) {
    console.error('Stripe subscription error:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message;
    if (error.code === 'resource_missing') {
      errorMessage = `Invalid price ID. Please check your Stripe configuration. The price ID provided does not exist in your Stripe account.`;
    } else if (error.type === 'StripeInvalidRequestError') {
      errorMessage = `Stripe configuration error: ${error.message}`;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.message,
      code: error.code
    });
  }
};

// Plan config using environment variables or fallback to placeholder IDs
const plans = {
  basic: { 
    priceId: process.env.STRIPE_BASIC_PRICE_ID || 'price_1RhXyIP1U1i66wzc1xXX3d8k', 
    name: 'Basic Subscription', 
    amount: 50 
  },
  premium: { 
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_1RhXyoP1U1i66wzcyJqee0gD', 
    name: 'Premium Subscription', 
    amount: 75 
  }
};

const getPlans = (req, res) => {
  // Check if we have valid price IDs
  const missingPriceIds = Object.entries(plans)
    .filter(([key, plan]) => !plan.priceId)
    .map(([key]) => key);
  
  if (missingPriceIds.length > 0) {
    console.warn(`⚠️  WARNING: Missing Stripe price IDs for: ${missingPriceIds.join(', ')}. Please set STRIPE_BASIC_PRICE_ID and STRIPE_PREMIUM_PRICE_ID environment variables.`);
  }
  
  res.json({ 
    plans,
    warning: missingPriceIds.length > 0 ? `Missing price IDs for: ${missingPriceIds.join(', ')}. Set environment variables for production.` : null,
    configured: missingPriceIds.length === 0
  });
};

// Get subscription details by ID
const getSubscriptionById = async (req, res) => {
  try {
    console.log('Fetching subscription with ID:', req.params.id);

    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid subscription ID format' 
      });
    }

    const subscription = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('orderItems.product', 'name image')
      .populate('statusHistory.updatedBy', 'name');

    if (!subscription) {
      console.log('Subscription not found');
      return res.status(404).json({ 
        success: false,
        message: 'Subscription not found' 
      });
    }

    if (!subscription.isSubscription) {
      return res.status(400).json({ 
        success: false,
        message: 'This is not a subscription order' 
      });
    }

    // Check authorization
    if (subscription.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view this subscription' 
      });
    }

    // Get Stripe subscription details if available
    let stripeDetails = null;
    if (subscription.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        stripeDetails = {
          id: stripeSubscription.id,
          status: stripeSubscription.status,
          current_period_start: new Date(stripeSubscription.current_period_start * 1000),
          current_period_end: new Date(stripeSubscription.current_period_end * 1000),
          cancel_at_period_end: stripeSubscription.cancel_at_period_end,
          canceled_at: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null
        };
      } catch (stripeError) {
        console.error('Error fetching Stripe subscription details:', stripeError);
      }
    }

    console.log('Subscription found and authorized');

    res.json({
      success: true,
      subscription: {
        ...subscription.toObject(),
        stripeDetails,
        trackingStage: subscription.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error getting subscription by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription details',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Update subscription details
const updateSubscription = async (req, res) => {
  try {
    const { shippingAddress, selectedProducts, notes } = req.body;
    
    const subscription = await Order.findById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ 
        success: false,
        message: 'Subscription not found' 
      });
    }

    if (!subscription.isSubscription) {
      return res.status(400).json({ 
        success: false,
        message: 'This is not a subscription order' 
      });
    }

    // Check authorization
    if (subscription.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to update this subscription' 
      });
    }

    // Update allowed fields
    if (shippingAddress) subscription.shippingAddress = shippingAddress;
    if (selectedProducts) subscription.selectedProducts = selectedProducts;
    if (notes) subscription.notes = notes;

    subscription.addStatusToHistory('Processing', 'Subscription details updated', req.user._id);

    const updatedSubscription = await subscription.save();

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: {
        ...updatedSubscription.toObject(),
        trackingStage: updatedSubscription.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating subscription',
      error: error.message 
    });
  }
};

// Get subscription payment history
const getSubscriptionPaymentHistory = async (req, res) => {
  try {
    const subscription = await Order.findById(req.params.id);

    if (!subscription) {
      return res.status(404).json({ 
        success: false,
        message: 'Subscription not found' 
      });
    }

    if (!subscription.isSubscription) {
      return res.status(400).json({ 
        success: false,
        message: 'This is not a subscription order' 
      });
    }

    // Check authorization
    if (subscription.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to view this subscription payment history' 
      });
    }

    // Get additional Stripe invoice data if available
    let stripeInvoices = [];
    if (subscription.stripeSubscriptionId) {
      try {
        const invoices = await stripe.invoices.list({
          subscription: subscription.stripeSubscriptionId,
          limit: 100
        });
        stripeInvoices = invoices.data;
      } catch (stripeError) {
        console.error('Error fetching Stripe invoices:', stripeError);
      }
    }

    // Combine local payment history with Stripe data
    const paymentHistory = subscription.paymentHistory.map(payment => {
      const stripeInvoice = stripeInvoices.find(invoice => 
        invoice.id === payment.stripeInvoiceId || 
        invoice.payment_intent === payment.stripePaymentIntentId
      );
      
      return {
        ...payment.toObject(),
        stripeInvoice: stripeInvoice ? {
          id: stripeInvoice.id,
          number: stripeInvoice.number,
          status: stripeInvoice.status,
          amount_paid: stripeInvoice.amount_paid,
          currency: stripeInvoice.currency,
          created: new Date(stripeInvoice.created * 1000),
          due_date: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null,
          period_start: stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000) : null,
          period_end: stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000) : null
        } : null
      };
    });

    res.json({
      success: true,
      paymentHistory: paymentHistory.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)),
      subscription: {
        id: subscription._id,
        subscriptionName: subscription.subscriptionName,
        subscriptionPrice: subscription.subscriptionPrice,
        currentBillingCycle: subscription.currentBillingCycle,
        totalBillingCycles: subscription.totalBillingCycles,
        subscriptionStatus: subscription.subscriptionStatus,
        nextBillingDate: subscription.nextBillingDate
      }
    });

  } catch (error) {
    console.error('Error getting subscription payment history:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching subscription payment history',
      error: error.message 
    });
  }
};



// Helper function to create one-time order
const createOneTimeOrder = async (req, res, orderData) => {
  const {
    orderItems, shippingAddress, paymentMethod, itemsPrice, taxPrice,
    shippingPrice, totalPrice, paymentDetails, notes, user
  } = orderData;

  const { paymentMethodId: frontendPaymentMethodId, cardNumber, expiryMonth, expiryYear, cvc, cardHolderName } = paymentDetails;

  // Clean card number for display purposes
  const cleanCardNumber = cardNumber ? cardNumber.replace(/\s/g, '') : '4242424242424242';

  // Create the order first
  const orderDbData = {
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
    isSubscription: false,
    paymentType: 'online',
    statusHistory: [{
      status: 'Pending',
      timestamp: new Date(),
      note: 'Order placed successfully',
      updatedBy: req.user._id
    }]
  };

  const order = await Order.create(orderDbData);
  console.log(`One-time order created with ID: ${order._id}`);

  // Use the payment method ID from frontend or fallback to test method
  const paymentMethodId = frontendPaymentMethodId || 'pm_card_visa';
  
  // Create payment intent for one-time payment
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
      orderType: 'one_time'
    },
    description: `One-time Order #${order._id} - ${orderItems.length} items`,
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

        // Add payment to history
        order.addPaymentToHistory({
          paymentId: paymentIntent.id,
          amount: totalPrice,
          currency: 'usd',
          status: 'succeeded',
          billingCycle: 1,
          stripePaymentIntentId: paymentIntent.id,
          metadata: {
            cardLast4: cleanCardNumber.slice(-4),
            paymentMethod: 'stripe'
          }
        });

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
};

// Helper function to create subscription order
const createSubscriptionOrder = async (req, res, orderData) => {
  const {
    orderItems, shippingAddress, paymentMethod, itemsPrice, taxPrice,
    shippingPrice, totalPrice, paymentDetails, notes, subscriptionType,
    subscriptionName, subscriptionPrice, maxProducts, recurrence,
    recurrenceLabel, selectedProducts, billingCycle, totalBillingCycles, user
  } = orderData;

  const { paymentMethodId: frontendPaymentMethodId, cardNumber, expiryMonth, expiryYear, cvc, cardHolderName } = paymentDetails;
  const cleanCardNumber = cardNumber.replace(/\s/g, '');

  // Create or get Stripe customer
  let customer;
  const existingCustomers = await stripe.customers.list({ 
    email: user.email, 
    limit: 1 
  });

  if (existingCustomers.data.length > 0) {
    customer = existingCustomers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: user.email,
      name: user.name || cardHolderName,
      metadata: {
        userId: req.user._id.toString()
      }
    });
  }

  // Use the payment method ID from the frontend
  const paymentMethodId = frontendPaymentMethodId || 'pm_card_visa';
  
  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customer.id,
  });

  // Set as default payment method
  await stripe.customers.update(customer.id, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  // Create or get subscription price
  const priceData = {
    unit_amount: Math.round((subscriptionPrice || totalPrice) * 100),
    currency: process.env.STRIPE_CURRENCY || 'usd',
    recurring: {
      interval: getStripeInterval(recurrence),
      interval_count: billingCycle || 1
    },
    product_data: {
      name: subscriptionName,
      metadata: {
        subscriptionType: subscriptionType
      }
    },
    metadata: {
      subscriptionType: subscriptionType,
      userId: req.user._id.toString()
    }
  };

  const price = await stripe.prices.create(priceData);

  // Create subscription
  const subscriptionData = {
    customer: customer.id,
    items: [{ price: price.id }],
    payment_settings: {
      payment_method_types: ['card'],
      save_default_payment_method: 'on_subscription'
    },
    expand: ['latest_invoice.payment_intent'],
    metadata: {
      userId: req.user._id.toString(),
      subscriptionType: subscriptionType,
      subscriptionName: subscriptionName
    }
  };

  // Add billing cycle limit if specified
  if (totalBillingCycles && totalBillingCycles > 0) {
    subscriptionData.cancel_at = new Date(Date.now() + (totalBillingCycles * getBillingCycleMs(recurrence, billingCycle)));
  }

  const subscription = await stripe.subscriptions.create(subscriptionData);

  // Create the order in database
  const orderDbData = {
    orderItems,
    user: req.user._id,
    shippingAddress,
    paymentMethod: paymentMethod.toLowerCase(),
    itemsPrice: itemsPrice || 0,
    taxPrice: taxPrice || 0,
    shippingPrice: shippingPrice || 0,
    totalPrice,
    status: 'Payment_Confirmed',
    notes,
    isSubscription: true,
    subscriptionType,
    subscriptionName,
    subscriptionPrice: subscriptionPrice || totalPrice,
    maxProducts,
    recurrence,
    recurrenceLabel,
    selectedProducts: selectedProducts || [],
    billingCycle: billingCycle || 1,
    totalBillingCycles,
    currentBillingCycle: 1,
    subscriptionStatus: 'active',
    paymentType: 'online',
    isPaid: true,
    paidAt: new Date(),
    // Store Stripe subscription details
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customer.id,
    stripePriceId: price.id,
    statusHistory: [{
      status: 'Payment_Confirmed',
      timestamp: new Date(),
      note: 'Subscription order created and first payment processed',
      updatedBy: req.user._id
    }]
  };

  const order = await Order.create(orderDbData);
  console.log(`Subscription order created with ID: ${order._id}, Stripe Subscription: ${subscription.id}`);

  // Add initial payment to history
  const initialPaymentData = {
    paymentId: subscription.latest_invoice?.payment_intent?.id || subscription.id,
    amount: subscriptionPrice || totalPrice,
    currency: 'usd',
    status: 'succeeded',
    billingCycle: 1,
    stripeInvoiceId: subscription.latest_invoice?.id,
    stripePaymentIntentId: subscription.latest_invoice?.payment_intent?.id,
    metadata: {
      cardLast4: cleanCardNumber.slice(-4),
      paymentMethod: 'stripe',
      subscriptionId: subscription.id
    }
  };
  
  console.log('Adding initial payment to history:', initialPaymentData);
  order.addPaymentToHistory(initialPaymentData);

  await order.save();
  console.log(`Subscription order ${order._id} created with initial payment tracked`);

  return res.status(201).json({
    success: true,
    message: 'Subscription created successfully! Automatic billing has been set up.',
    order,
    orderId: order._id,
    subscription: {
      id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      amount: subscriptionPrice || totalPrice,
      interval: recurrence,
      cardLast4: cleanCardNumber.slice(-4),
    }
  });
};

// Helper function to convert recurrence to Stripe interval
const getStripeInterval = (recurrence) => {
  switch (recurrence) {
    case 'weekly':
      return 'week';
    case 'biweekly':
      return 'week'; // We'll use interval_count: 2
    case 'monthly':
      return 'month';
    case 'quarterly':
      return 'month'; // We'll use interval_count: 3
    default:
      return 'month';
  }
};

// Helper function to get billing cycle in milliseconds
const getBillingCycleMs = (recurrence, billingCycle = 1) => {
  const baseMs = {
    'weekly': 7 * 24 * 60 * 60 * 1000,
    'biweekly': 14 * 24 * 60 * 60 * 1000,
    'monthly': 30 * 24 * 60 * 60 * 1000,
    'quarterly': 90 * 24 * 60 * 60 * 1000
  };
  return baseMs[recurrence] * billingCycle;
};

// Get orders with enhanced filtering (removed COD references)
const getOrders = async (req, res) => {
  try {
    console.log('Admin fetching all orders...');
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    const orderType = req.query.orderType; // 'subscription' or 'one_time'
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    // Build filter object
    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (orderType && orderType !== 'all') {
      filter.isSubscription = orderType === 'subscription';
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

    const allMatchingOrders = await Order.find(filter);
    const stats = {
      total: totalOrders,
      pending: allMatchingOrders.filter(order => order.status === 'Pending').length,
      processing: allMatchingOrders.filter(order => order.status === 'Processing').length,
      shipped: allMatchingOrders.filter(order => order.status === 'Shipped').length,
      delivered: allMatchingOrders.filter(order => order.isDelivered || order.status === 'Delivered').length,
      cancelled: allMatchingOrders.filter(order => order.status === 'Cancelled').length,
      totalRevenue: allMatchingOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      paidOrders: allMatchingOrders.filter(order => order.isPaid).length
    };
    // --- END NEW ---

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
      stats // <-- add this
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
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    const orderType = req.query.orderType; // 'subscription' or 'one_time'
    
    let filter = { user: req.user._id };
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (orderType && orderType !== 'all') {
      filter.isSubscription = orderType === 'subscription';
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
          const review = await Review.findOne({
            userId: req.user._id,
            productId: item.product,
            orderId: order._id
          }).lean();
          
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

    // Check if this is a subscription that has been cancelled by the user
    if (order.isSubscription && order.subscriptionStatus === 'cancelled') {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot update status for a subscription that has been cancelled by the user. The subscription must be reactivated first.' 
      });
    }

    // Add status to history
    order.addStatusToHistory(status, note || `Status updated to ${status}`, req.user._id);

    // Update specific fields based on status
    if (status === 'Delivered' && !order.isDelivered) {
      order.isDelivered = true;
      order.deliveredAt = new Date();
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

// Get order tracking info for frontend
const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', '_id name email')
      .populate('statusHistory.updatedBy', 'name')
      .select('status statusHistory tracking paymentType totalPrice user isSubscription stripeSubscriptionId');

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    // Check authorization
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

    // Get subscription info if it's a subscription
    let subscriptionInfo = null;
    if (order.isSubscription && order.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(order.stripeSubscriptionId);
        subscriptionInfo = {
          id: subscription.id,
          status: subscription.status,
          current_period_start: new Date(subscription.current_period_start * 1000),
          current_period_end: new Date(subscription.current_period_end * 1000),
          cancel_at_period_end: subscription.cancel_at_period_end
        };
      } catch (stripeError) {
        console.error('Error fetching subscription info:', stripeError);
      }
    }

    res.json({
      success: true,
      tracking: {
        ...trackingInfo,
        orderId: order._id,
        currentStatus: order.status,
        paymentType: order.paymentType,
        isSubscription: order.isSubscription,
        subscriptionInfo,
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
        }))
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

// Enhanced cancel order with tracking and subscription handling
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

    // Cancel Stripe subscription if it's a subscription order
    if (order.isSubscription && order.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(order.stripeSubscriptionId, {
          cancel_at_period_end: true
        });
        console.log(`Cancelled Stripe subscription: ${order.stripeSubscriptionId}`);
        order.subscriptionStatus = 'cancelled';
      } catch (stripeError) {
        console.error('Error cancelling Stripe subscription:', stripeError);
      }
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

    // Cancel Stripe subscription if exists
    if (order.isSubscription && order.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(order.stripeSubscriptionId);
        console.log(`Deleted Stripe subscription: ${order.stripeSubscriptionId}`);
      } catch (stripeError) {
        console.error('Error deleting Stripe subscription:', stripeError);
      }
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

// Enhanced webhook handler for both one-time and subscription payments
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

    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      try {
        // Find the order with this subscription ID
        const order = await Order.findOne({ stripeSubscriptionId: subscriptionId });
        
        if (order && order.isSubscription) {
          console.log(`Processing payment for subscription ${subscriptionId}, invoice ${invoice.id}`);
          
          // Add payment to history for the original subscription order
          order.addPaymentToHistory({
            paymentId: invoice.payment_intent || invoice.id,
            amount: invoice.amount_paid / 100, // Convert from cents
            currency: invoice.currency,
            status: 'succeeded',
            billingCycle: order.currentBillingCycle + 1,
            stripeInvoiceId: invoice.id,
            stripePaymentIntentId: invoice.payment_intent,
            metadata: {
              invoiceNumber: invoice.number,
              billingReason: invoice.billing_reason,
              periodStart: new Date(invoice.period_start * 1000),
              periodEnd: new Date(invoice.period_end * 1000)
            }
          });

          // For recurring payments, create a new order for the billing cycle
          if (invoice.billing_reason === 'subscription_cycle') {
            const newOrderData = {
              orderItems: order.orderItems,
              user: order.user,
              shippingAddress: order.shippingAddress,
              paymentMethod: order.paymentMethod,
              itemsPrice: order.itemsPrice,
              taxPrice: order.taxPrice,
              shippingPrice: order.shippingPrice,
              totalPrice: order.subscriptionPrice,
              isSubscription: true,
              subscriptionType: order.subscriptionType,
              subscriptionName: order.subscriptionName,
              subscriptionPrice: order.subscriptionPrice,
              maxProducts: order.maxProducts,
              recurrence: order.recurrence,
              recurrenceLabel: order.recurrenceLabel,
              selectedProducts: order.selectedProducts,
              billingCycle: order.billingCycle,
              totalBillingCycles: order.totalBillingCycles,
              currentBillingCycle: order.currentBillingCycle + 1,
              subscriptionStatus: 'active',
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: order.stripeCustomerId,
              stripePriceId: order.stripePriceId,
              status: 'Payment_Confirmed',
              isPaid: true,
              paidAt: new Date(),
              paymentType: 'online',
              statusHistory: [{
                status: 'Payment_Confirmed',
                timestamp: new Date(),
                note: `Recurring payment processed for billing cycle ${order.currentBillingCycle + 1}`,
                updatedBy: order.user
              }]
            };

            const newOrder = await Order.create(newOrderData);
            
            // Update the original subscription order
            order.currentBillingCycle += 1;
            await order.save();
            
            console.log(`Created new order ${newOrder._id} for subscription billing cycle ${order.currentBillingCycle}`);
          } else {
            // Just update the original order for initial payment
            await order.save();
            console.log(`Updated original subscription order ${order._id} with payment history`);
          }
        }
      } catch (error) {
        console.error('Error processing subscription payment:', error);
      }
      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      const failedSubscriptionId = failedInvoice.subscription;

      try {
        const order = await Order.findOne({ stripeSubscriptionId: failedSubscriptionId });
        if (order && order.isSubscription) {
          order.addStatusToHistory('Payment_Failed', 'Subscription payment failed via Stripe webhook');
          order.subscriptionStatus = 'payment_failed';
          await order.save();
          console.log(`Subscription payment failed for order ${order._id}`);
        }
      } catch (error) {
        console.error('Error updating order after subscription payment failure:', error);
      }
      break;

    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      
      try {
        const order = await Order.findOne({ stripeSubscriptionId: deletedSubscription.id });
        if (order && order.isSubscription) {
          order.addStatusToHistory('Cancelled', 'Subscription cancelled via Stripe webhook');
          order.subscriptionStatus = 'cancelled';
          await order.save();
          console.log(`Subscription cancelled for order ${order._id}`);
        }
      } catch (error) {
        console.error('Error updating order after subscription cancellation:', error);
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
      paymentType: 'online',
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

// Get user's subscriptions
const getMySubscriptions = async (req, res) => {
  try {
    console.log(`Fetching subscriptions for user: ${req.user._id}`);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    
    const status = req.query.status;
    
    let filter = { 
      user: req.user._id,
      isSubscription: true
    };
    
    if (status && status !== 'all') {
      filter.subscriptionStatus = status;
    }

    const totalSubscriptions = await Order.countDocuments(filter);
    
    const subscriptions = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get additional Stripe subscription details
    for (let subscription of subscriptions) {
      if (subscription.stripeSubscriptionId) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          subscription.stripeDetails = {
            status: stripeSubscription.status,
            current_period_start: new Date(stripeSubscription.current_period_start * 1000),
            current_period_end: new Date(stripeSubscription.current_period_end * 1000),
            cancel_at_period_end: stripeSubscription.cancel_at_period_end
          };
        } catch (stripeError) {
          console.error('Error fetching Stripe subscription:', stripeError);
        }
      }
    }

    console.log(`Found ${subscriptions.length} subscriptions for user`);

    res.json({
      success: true,
      subscriptions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalSubscriptions / limit),
        totalSubscriptions,
        hasNextPage: page < Math.ceil(totalSubscriptions / limit),
        hasPrevPage: page > 1,
      },
    });
    
  } catch (error) {
    console.error('Error getting user subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching your subscriptions',
      error: error.message
    });
  }
};

// Pause subscription
const pauseSubscription = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Subscription not found' 
      });
    }

    // Check authorization
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to pause this subscription' 
      });
    }

    // Check if it's a subscription
    if (!order.isSubscription) {
      return res.status(400).json({ 
        success: false,
        message: 'This is not a subscription order' 
      });
    }

    // Check if subscription can be paused
    if (order.subscriptionStatus !== 'active') {
      return res.status(400).json({ 
        success: false,
        message: 'Only active subscriptions can be paused' 
      });
    }

    // Pause Stripe subscription
    if (order.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(order.stripeSubscriptionId, {
          pause_collection: {
            behavior: 'keep_as_draft'
          }
        });
        console.log(`Paused Stripe subscription: ${order.stripeSubscriptionId}`);
      } catch (stripeError) {
        console.error('Error pausing Stripe subscription:', stripeError);
        return res.status(400).json({
          success: false,
          message: 'Error pausing subscription with Stripe',
          error: stripeError.message
        });
      }
    }

    order.subscriptionStatus = 'paused';
    order.addStatusToHistory('Cancelled', `Subscription paused: ${reason || 'User request'}`, req.user._id);

    const updatedOrder = await order.save();

    console.log(`Subscription ${order._id} paused`);

    res.json({
      success: true,
      message: 'Subscription paused successfully',
      subscription: {
        ...updatedOrder.toObject(),
        trackingStage: updatedOrder.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error pausing subscription:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error pausing subscription',
      error: error.message 
    });
  }
};

// Resume subscription
const resumeSubscription = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Subscription not found' 
      });
    }

    // Check authorization
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to resume this subscription' 
      });
    }

    // Check if it's a subscription
    if (!order.isSubscription) {
      return res.status(400).json({ 
        success: false,
        message: 'This is not a subscription order' 
      });
    }

    // Check if subscription can be resumed
    if (order.subscriptionStatus !== 'paused') {
      return res.status(400).json({ 
        success: false,
        message: 'Only paused subscriptions can be resumed' 
      });
    }

    // Resume Stripe subscription
    if (order.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(order.stripeSubscriptionId, {
          pause_collection: ''
        });
        console.log(`Resumed Stripe subscription: ${order.stripeSubscriptionId}`);
      } catch (stripeError) {
        console.error('Error resuming Stripe subscription:', stripeError);
        return res.status(400).json({
          success: false,
          message: 'Error resuming subscription with Stripe',
          error: stripeError.message
        });
      }
    }

    order.subscriptionStatus = 'active';
    order.addStatusToHistory('Payment_Confirmed', 'Subscription resumed', req.user._id);

    const updatedOrder = await order.save();

    console.log(`Subscription ${order._id} resumed`);

    res.json({
      success: true,
      message: 'Subscription resumed successfully',
      subscription: {
        ...updatedOrder.toObject(),
        trackingStage: updatedOrder.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error resuming subscription:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error resuming subscription',
      error: error.message 
    });
  }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false,
        message: 'Subscription not found' 
      });
    }

    // Check authorization
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to cancel this subscription' 
      });
    }

    // Check if it's a subscription
    if (!order.isSubscription) {
      return res.status(400).json({ 
        success: false,
        message: 'This is not a subscription order' 
      });
    }

    // Check if subscription can be cancelled
    if (['cancelled', 'expired'].includes(order.subscriptionStatus)) {
      return res.status(400).json({ 
        success: false,
        message: 'Subscription is already cancelled or expired' 
      });
    }

    // Cancel Stripe subscription
    if (order.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(order.stripeSubscriptionId, {
          cancel_at_period_end: true
        });
        console.log(`Cancelled Stripe subscription: ${order.stripeSubscriptionId}`);
      } catch (stripeError) {
        console.error('Error cancelling Stripe subscription:', stripeError);
        return res.status(400).json({
          success: false,
          message: 'Error cancelling subscription with Stripe',
          error: stripeError.message
        });
      }
    }

    order.subscriptionStatus = 'cancelled';
    order.addStatusToHistory('Cancelled', `Subscription cancelled: ${reason || 'User request'}`, req.user._id);

    const updatedOrder = await order.save();

    console.log(`Subscription ${order._id} cancelled`);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription: {
        ...updatedOrder.toObject(),
        trackingStage: updatedOrder.getTrackingStage()
      }
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error cancelling subscription',
      error: error.message 
    });
  }
};



// Process recurring billing for subscriptions (now handled by Stripe webhooks)
const processRecurringBilling = async (req, res) => {
  try {
    console.log('Checking Stripe subscriptions status...');
    
    // Get all active subscriptions from database
    const activeSubscriptions = await Order.find({ 
      isSubscription: true, 
      subscriptionStatus: 'active',
      stripeSubscriptionId: { $exists: true }
    }).populate('user', 'name email');
    
    const processedSubscriptions = [];
    const failedSubscriptions = [];

    for (const subscription of activeSubscriptions) {
      try {
        // Check Stripe subscription status
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        
        // Update local subscription status based on Stripe status
        let updated = false;
        if (stripeSubscription.status === 'canceled' && subscription.subscriptionStatus !== 'cancelled') {
          subscription.subscriptionStatus = 'cancelled';
          subscription.addStatusToHistory('Cancelled', 'Subscription cancelled in Stripe', null);
          updated = true;
        } else if (stripeSubscription.status === 'past_due' && subscription.subscriptionStatus !== 'payment_failed') {
          subscription.subscriptionStatus = 'payment_failed';
          subscription.addStatusToHistory('Payment_Failed', 'Subscription payment past due', null);
          updated = true;
        }

        if (updated) {
          await subscription.save();
          processedSubscriptions.push({
            subscriptionId: subscription._id,
            stripeStatus: stripeSubscription.status,
            action: 'updated_status'
          });
        }

        console.log(`Checked subscription ${subscription._id}, Stripe status: ${stripeSubscription.status}`);
      } catch (error) {
        console.error(`Error checking subscription ${subscription._id}:`, error);
        failedSubscriptions.push({
          subscriptionId: subscription._id,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Subscription status check completed',
      processed: processedSubscriptions.length,
      failed: failedSubscriptions.length,
      processedSubscriptions,
      failedSubscriptions,
      note: 'Recurring billing is now handled automatically by Stripe webhooks'
    });

  } catch (error) {
    console.error('Error processing recurring billing:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error processing recurring billing',
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
  getOrderTracking,
  initiateReturn,
  updateTracking,
  createPaymentIntent,
  confirmPayment,
  // Subscription functions
  getMySubscriptions,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  processRecurringBilling,
  getSubscriptionAnalytics, 
  createStripeSubscription,
  getPlans,
  getSubscriptionById,
  updateSubscription,
  getSubscriptionPaymentHistory
};