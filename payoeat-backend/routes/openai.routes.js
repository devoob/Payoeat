import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import apiUsageTracker from '../middlewares/apiUsageTracker.middleware.js';

const openaiRouter = express.Router();

// Apply auth middleware and API usage tracking to all routes
openaiRouter.use(authMiddleware);
openaiRouter.use(apiUsageTracker);



export default openaiRouter;