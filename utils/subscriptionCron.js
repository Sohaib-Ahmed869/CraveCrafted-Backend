const cron = require('node-cron');
const api = require('../index');
const Order = require('../Models/Order');

// Function to process recurring billing
const processRecurringBilling = async () => {
  try {
    console.log('🔄 Processing recurring billing for subscriptions...');
    
    // Try to get active subscriptions with fallback
    let activeSubscriptions;
    try {
      activeSubscriptions = await Order.getActiveSubscriptions();
    } catch (error) {
      console.error('Error calling getActiveSubscriptions:', error);
      // Fallback: manually query for active subscriptions
      activeSubscriptions = await Order.find({ 
        isSubscription: true, 
        subscriptionStatus: 'active' 
      }).populate('user', 'name email').sort({ nextBillingDate: 1 });
    }
    
    const processedSubscriptions = [];
    const failedSubscriptions = [];

    for (const subscription of activeSubscriptions) {
      try {
        const shouldProcess = subscription.processNextBillingCycle();
        
        if (shouldProcess) {
          // Create a new order for the next billing cycle
          const newOrderData = {
            orderItems: subscription.orderItems,
            user: subscription.user._id,
            shippingAddress: subscription.shippingAddress,
            paymentMethod: subscription.paymentMethod,
            itemsPrice: subscription.itemsPrice,
            taxPrice: subscription.taxPrice,
            shippingPrice: subscription.shippingPrice,
            totalPrice: subscription.subscriptionPrice,
            isSubscription: true,
            subscriptionType: subscription.subscriptionType,
            subscriptionName: subscription.subscriptionName,
            subscriptionPrice: subscription.subscriptionPrice,
            maxProducts: subscription.maxProducts,
            recurrence: subscription.recurrence,
            recurrenceLabel: subscription.recurrenceLabel,
            selectedProducts: subscription.selectedProducts,
            billingCycle: subscription.billingCycle,
            totalBillingCycles: subscription.totalBillingCycles,
            currentBillingCycle: subscription.currentBillingCycle,
            status: 'Payment_Confirmed',
            isPaid: true,
            paidAt: new Date(),
            statusHistory: [{
              status: 'Payment_Confirmed',
              timestamp: new Date(),
              note: `Recurring billing for subscription cycle ${subscription.currentBillingCycle}`,
              updatedBy: subscription.user._id
            }]
          };

          const newOrder = await Order.create(newOrderData);
          await subscription.save(); // Save the updated subscription with new billing date
          
          processedSubscriptions.push({
            subscriptionId: subscription._id,
            newOrderId: newOrder._id,
            billingCycle: subscription.currentBillingCycle,
            userEmail: subscription.user.email
          });

          console.log(`✅ Processed billing for subscription ${subscription._id}, new order: ${newOrder._id}`);
        }
      } catch (error) {
        console.error(`❌ Error processing subscription ${subscription._id}:`, error);
        failedSubscriptions.push({
          subscriptionId: subscription._id,
          error: error.message
        });
      }
    }

    console.log(`📊 Recurring billing summary:`);
    console.log(`   - Processed: ${processedSubscriptions.length}`);
    console.log(`   - Failed: ${failedSubscriptions.length}`);
    console.log(`   - Total active subscriptions: ${activeSubscriptions.length}`);

    return {
      processed: processedSubscriptions.length,
      failed: failedSubscriptions.length,
      processedSubscriptions,
      failedSubscriptions
    };

  } catch (error) {
    console.error('❌ Error in recurring billing process:', error);
    throw error;
  }
};

// Schedule recurring billing - run daily at 2 AM
const scheduleRecurringBilling = () => {
  console.log('⏰ Scheduling recurring billing cron job...');
  
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running scheduled recurring billing...');
    try {
      await processRecurringBilling();
      console.log('✅ Scheduled recurring billing completed successfully');
    } catch (error) {
      console.error('❌ Scheduled recurring billing failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "UTC"
  });

  console.log('✅ Recurring billing scheduled for daily at 2:00 AM UTC');
};

// Manual trigger for testing
const triggerRecurringBilling = async () => {
  console.log('🔧 Manually triggering recurring billing...');
  try {
    const result = await processRecurringBilling();
    console.log('✅ Manual recurring billing completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Manual recurring billing failed:', error);
    throw error;
  }
};

// Initialize cron jobs
const initializeSubscriptionCron = () => {
  scheduleRecurringBilling();
};

module.exports = {
  processRecurringBilling,
  scheduleRecurringBilling,
  triggerRecurringBilling,
  initializeSubscriptionCron
}; 