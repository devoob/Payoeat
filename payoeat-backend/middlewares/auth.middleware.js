import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check for missing header or bad format
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token, access denied' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Received token:', token);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, ... } from jwt.sign()
    console.log('Authenticated user:', req.user);
    next();
  } catch (err) {
    return res.status(403).json({ msg: 'Token is not valid' });
  }
};

export default authMiddleware;