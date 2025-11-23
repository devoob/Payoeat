import express from 'express';
import { register, login, logout, getUser, appleLogin, linkAccount, getApiUsage, updateUser } from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const authRouter = express.Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/apple', appleLogin);
authRouter.post('/link-account', linkAccount);
authRouter.post('/logout', logout);
authRouter.get('/me', authMiddleware, getUser);
authRouter.put('/me', authMiddleware, updateUser);
authRouter.get('/api-usage', authMiddleware, getApiUsage);

export default authRouter;