import User from '../models/User.js';

/**
 * Middleware to track API usage costs for authenticated users
 * This should be used after the auth middleware to ensure req.user exists
 */
const apiUsageTracker = async (req, res, next) => {
  // Store original res.json to intercept responses
  const originalJson = res.json;
  
  // Override res.json to capture response and track usage
  res.json = function(data) {
    // Check if this is an OpenAI API response with usage data
    if (req.apiUsageCost && req.user && req.user.id) {
      // Track usage asynchronously (don't block response)
      trackUserApiUsage(req.user.id, req.apiUsageCost, req.originalUrl)
        .catch(error => {
          console.error('Error tracking API usage:', error);
        });
    }
    
    // Call original res.json with the data
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Async function to update user's total API usage cost
 * @param {string} userId - User ID
 * @param {number} cost - Cost in USD
 * @param {string} endpoint - API endpoint called
 */
const trackUserApiUsage = async (userId, cost, endpoint) => {
  try {
    const roundedCost = Math.round(cost * 100000) / 100000; // Round to 5 decimal places
    
    console.log(`Tracking API usage: User ${userId}, Cost: $${roundedCost}, Endpoint: ${endpoint}`);
    
    // Update user's total API usage cost atomically
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $inc: { totalApiUsagePrice: roundedCost }
      },
      { 
        new: true,
        select: 'totalApiUsagePrice email'
      }
    );
    
    if (updatedUser) {
      console.log(`User ${updatedUser.email} total API usage: $${updatedUser.totalApiUsagePrice.toFixed(5)}`);
    } else {
      console.error(`User ${userId} not found for API usage tracking`);
    }
    
  } catch (error) {
    console.error('Error updating user API usage:', error);
  }
};

/**
 * Helper function to set API usage cost in request object
 * Call this in your controller after calculating the cost
 * @param {Object} req - Express request object
 * @param {number} cost - Cost in USD
 */
export const setApiUsageCost = (req, cost) => {
  req.apiUsageCost = cost;
};

export default apiUsageTracker;