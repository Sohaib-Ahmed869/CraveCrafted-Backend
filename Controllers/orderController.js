const Order = require('../Models/Order');
const User = require('../Models/Users');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
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
    } = req.body;

    if (orderItems && orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    const order = await Order.create({
      orderItems,
      user: req.user._id,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  try {
    console.log('Fetching all orders...'); // Debug log
    
    // Find all orders and sort by creation date
    const orders = await Order.find({}).sort({ createdAt: -1 });
    console.log(`Found ${orders.length} orders`); // Debug log

    // Return the orders array directly
    res.json(orders);
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error getting user orders:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    console.log('Fetching order with ID:', req.params.id);
    
    const order = await Order.findById(req.params.id);
    console.log('Found order:', order);

    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ message: 'Order not found' });
    }

    // Manually populate user data
    const user = await User.findById(order.user).select('name email');
    const populatedOrder = {
      ...order.toObject(),
      user: user || { name: 'Unknown', email: 'Unknown' }
    };

    console.log('Order after populate:', populatedOrder);
    res.json(populatedOrder);
  } catch (error) {
    console.error('Error getting order by ID:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Error fetching order details',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (order) {
      order.status = req.body.status;
      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
}; 