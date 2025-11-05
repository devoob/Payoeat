import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { verifyAppleToken } from '../utils/appleAuth.js';

// Register
const register = async (req, res) => {
  const { email, password } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ msg: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const userObj = user.toObject();
    delete userObj.password;

    return res.status(200).json({
      user: userObj,
      token, // 👈 Token is sent here
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Server error from register' });
  }
};

// Login
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const userObj = user.toObject();
    delete userObj.password;

    return res.status(200).json({
      user: userObj,
      token: token, // 👈 Token is sent here
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Server error from login' });
  }
};

// Logout (Client should just delete token locally)
const logout = (req, res) => {
  // Nothing to do on the server unless you're using a token blacklist
  console.log('User logged out');
  return res.status(200).json({ msg: 'Logged out successfully' });
};

// Get user info (req.user must be set by auth middleware)
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    return res.status(200).json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Server error from getUser' });
  }
};

// Apple Login
const appleLogin = async (req, res) => {
  const { identityToken, email, fullName } = req.body;
  
  try {
    console.log('Apple login data received:', { 
      hasIdentityToken: !!identityToken, 
      email, 
      fullName 
    });
    
    if (!identityToken) {
      return res.status(400).json({ msg: 'Identity token is required' });
    }

    // Verify the Apple identity token
    const decoded = await verifyAppleToken(identityToken);
    const appleId = decoded.sub;

    // Check if user exists with Apple ID
    let user = await User.findOne({ appleId });

    if (user) {
      // User exists, log them in
      console.log('Existing Apple user found, logging in');
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      
      const userObj = user.toObject();
      delete userObj.password;
      
      return res.status(200).json({
        user: userObj,
        token,
      });
    } else {
      // Check if user exists with the same email
      const existingUser = await User.findOne({ email });
      
      if (existingUser) {
        console.log('Existing email user found, auto-linking Apple ID');
        // Link Apple ID to existing account
        existingUser.appleId = appleId;
        existingUser.authProvider = 'apple';
        if (fullName && !existingUser.fullName) {
          existingUser.fullName = fullName ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() : '';
        }
        await existingUser.save();
        
        const token = jwt.sign({ id: existingUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        const userObj = existingUser.toObject();
        delete userObj.password;
        
        return res.status(200).json({
          user: userObj,
          token,
        });
      } else {
        console.log('Creating new Apple user with account linking option');
        // Create new user
        // Use provided email or generate a placeholder for private relay users
        const userEmail = email || `apple.${appleId.substring(0, 8)}@privaterelay.local`;
        
        const newUser = await User.create({
          email: userEmail,
          appleId,
          fullName: fullName ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() : '',
          authProvider: 'apple',
        });
        
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        const userObj = newUser.toObject();
        delete userObj.password;
        
        console.log('Sending response with needsAccountLinking: true');
        return res.status(200).json({
          user: userObj,
          token,
          needsAccountLinking: true,
        });
      }
    }
  } catch (err) {
    console.error('Apple login error:', err);
    return res.status(500).json({ msg: 'Server error from Apple login' });
  }
};

// Link Apple account to existing account
const linkAccount = async (req, res) => {
  const { identityToken, email, password } = req.body;
  
  try {
    if (!identityToken || !email || !password) {
      return res.status(400).json({ msg: 'Identity token, email, and password are required' });
    }

    // Verify the Apple identity token
    const decoded = await verifyAppleToken(identityToken);
    const appleId = decoded.sub;

    // Find the temporary Apple user
    const appleUser = await User.findOne({ appleId });
    if (!appleUser) {
      return res.status(400).json({ msg: 'Apple account not found' });
    }

    // Verify existing account credentials
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return res.status(400).json({ msg: 'No account found with this email' });
    }

    // Check password for existing account
    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Check if the existing user already has this Apple ID linked
    if (existingUser.appleId === appleId) {
      return res.status(400).json({ msg: 'This Apple ID is already linked to your account' });
    }

    // Check if the existing user already has a different Apple ID
    if (existingUser.appleId && existingUser.appleId !== appleId) {
      return res.status(400).json({ msg: 'This account is already linked to a different Apple ID' });
    }

    // Delete the temporary Apple-only account first (to free up the appleId)
    await User.findByIdAndDelete(appleUser._id);

    // Link Apple ID to existing account
    existingUser.appleId = appleId;
    existingUser.authProvider = 'apple';
    await existingUser.save();

    // Generate new token for the linked account
    const token = jwt.sign({ id: existingUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const userObj = existingUser.toObject();
    delete userObj.password;

    return res.status(200).json({
      user: userObj,
      token,
      message: 'Account linked successfully',
    });
  } catch (err) {
    console.error('Account linking error:', err);
    return res.status(500).json({ msg: 'Server error during account linking' });
  }
};

// Get user's API usage statistics
const getApiUsage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email totalApiUsagePrice createdAt');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Calculate days since user registration
    const daysSinceRegistration = Math.ceil((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24));
    const averageDailyCost = user.totalApiUsagePrice / Math.max(daysSinceRegistration, 1);

    return res.status(200).json({
      email: user.email,
      totalApiUsagePrice: user.totalApiUsagePrice,
      formattedTotalCost: `$${user.totalApiUsagePrice.toFixed(5)}`,
      daysSinceRegistration,
      averageDailyCost: averageDailyCost.toFixed(5),
      formattedAverageDailyCost: `$${averageDailyCost.toFixed(5)}`,
      registrationDate: user.createdAt.toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Get API usage error:', err);
    return res.status(500).json({ msg: 'Server error fetching API usage' });
  }
};

export { register, login, logout, getUser, appleLogin, linkAccount, getApiUsage };