import './loadEnv.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import loggerMiddleware from './middlewares/logger.middleware.js';
import { globalRateLimit, authRateLimit, openaiRateLimit, uploadRateLimit } from './middlewares/rateLimiting.middleware.js';

// Routes
import authRouter from './routes/auth.routes.js';
import openaiRoutes from './routes/openai.routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Disable for mobile app compatibility
  contentSecurityPolicy: false, // Disable CSP for API-only server
}));

// Global rate limiting
app.use(globalRateLimit);

// Logger middleware - should be after rate limiting to avoid logging blocked requests
app.use(loggerMiddleware);

// Request parsing with reduced limits for mobile efficiency
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// CORS configuration - permissive for mobile apps
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL].filter(Boolean) // Production: only allow specified origins
    : true, // Development: allow all origins for mobile app flexibility
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/openai', openaiRateLimit, uploadRateLimit, openaiRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
