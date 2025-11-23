import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, GetCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { db } from '../config/db.js';
import { verifyAppleToken } from '../utils/appleAuth.js';

const TABLE_NAME = process.env.DYNAMO_TABLE;

// Helper function to get user by email
const getUserByEmail = async (email) => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'EmailIndex', // You'll need to create this GSI
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': email.toLowerCase(),
    },
  };

  try {
    const result = await db.send(new QueryCommand(params));
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  } catch (err) {
    console.error('Error querying user by email:', err);
    throw err;
  }
};

// Helper function to get user by Apple ID
const getUserByAppleId = async (appleId) => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'AppleIdIndex', // You'll need to create this GSI
    KeyConditionExpression: 'appleId = :appleId',
    ExpressionAttributeValues: {
      ':appleId': appleId,
    },
  };

  try {
    const result = await db.send(new QueryCommand(params));
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  } catch (err) {
    console.error('Error querying user by appleId:', err);
    throw err;
  }
};

// Helper function to get user by userId
const getUserById = async (userId) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
    },
  };

  try {
    const result = await db.send(new GetCommand(params));
    return result.Item || null;
  } catch (err) {
    console.error('Error getting user by ID:', err);
    throw err;
  }
};

// Register
const register = async (req, res) => {
  const { email, password } = req.body;
  try {
    const userExists = await getUserByEmail(email);
    if (userExists) return res.status(400).json({ msg: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const now = new Date().toISOString();

    const user = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      userId,
      email: email.toLowerCase(),
      password: hashedPassword,
      authProvider: 'local',
      totalApiUsagePrice: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: user,
    }));

    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const userResponse = { ...user };
    delete userResponse.password;
    delete userResponse.PK;
    delete userResponse.SK;

    return res.status(200).json({
      user: userResponse,
      token,
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
    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const userResponse = { ...user };
    delete userResponse.password;
    delete userResponse.PK;
    delete userResponse.SK;

    return res.status(200).json({
      user: userResponse,
      token,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Server error from login' });
  }
};

// Logout (Client should just delete token locally)
const logout = (req, res) => {
  console.log('User logged out');
  return res.status(200).json({ msg: 'Logged out successfully' });
};

// Get user info (req.user must be set by auth middleware)
const getUser = async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const userResponse = { ...user };
    delete userResponse.password;
    delete userResponse.PK;
    delete userResponse.SK;

    return res.status(200).json(userResponse);
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
    let user = await getUserByAppleId(appleId);

    if (user) {
      // User exists, log them in
      console.log('Existing Apple user found, logging in');
      const token = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

      const userResponse = { ...user };
      delete userResponse.password;
      delete userResponse.PK;
      delete userResponse.SK;

      return res.status(200).json({
        user: userResponse,
        token,
      });
    } else {
      // Check if user exists with the same email
      const existingUser = email ? await getUserByEmail(email) : null;

      if (existingUser) {
        console.log('Existing email user found, auto-linking Apple ID');
        // Link Apple ID to existing account
        const now = new Date().toISOString();
        const fullNameStr = fullName ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() : '';

        await db.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: existingUser.PK,
            SK: existingUser.SK,
          },
          UpdateExpression: 'SET appleId = :appleId, authProvider = :authProvider, updatedAt = :updatedAt' +
            (fullNameStr && !existingUser.fullName ? ', fullName = :fullName' : ''),
          ExpressionAttributeValues: {
            ':appleId': appleId,
            ':authProvider': 'apple',
            ':updatedAt': now,
            ...(fullNameStr && !existingUser.fullName ? { ':fullName': fullNameStr } : {}),
          },
        }));

        existingUser.appleId = appleId;
        existingUser.authProvider = 'apple';
        existingUser.updatedAt = now;
        if (fullNameStr && !existingUser.fullName) {
          existingUser.fullName = fullNameStr;
        }

        const token = jwt.sign({ id: existingUser.userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

        const userResponse = { ...existingUser };
        delete userResponse.password;
        delete userResponse.PK;
        delete userResponse.SK;

        return res.status(200).json({
          user: userResponse,
          token,
        });
      } else {
        console.log('Creating new Apple user with account linking option');
        // Create new user
        // Use provided email or generate a placeholder for private relay users
        const userEmail = email || `apple.${appleId.substring(0, 8)}@privaterelay.local`;
        const userId = uuidv4();
        const now = new Date().toISOString();

        const newUser = {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
          userId,
          email: userEmail.toLowerCase(),
          appleId,
          fullName: fullName ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() : '',
          authProvider: 'apple',
          totalApiUsagePrice: 0,
          createdAt: now,
          updatedAt: now,
        };

        await db.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: newUser,
        }));

        const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

        const userResponse = { ...newUser };
        delete userResponse.password;
        delete userResponse.PK;
        delete userResponse.SK;

        console.log('Sending response with needsAccountLinking: true');
        return res.status(200).json({
          user: userResponse,
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
    const appleUser = await getUserByAppleId(appleId);
    if (!appleUser) {
      return res.status(400).json({ msg: 'Apple account not found' });
    }

    // Verify existing account credentials
    const existingUser = await getUserByEmail(email);
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
    await db.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: appleUser.PK,
        SK: appleUser.SK,
      },
    }));

    // Link Apple ID to existing account
    const now = new Date().toISOString();
    await db.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: existingUser.PK,
        SK: existingUser.SK,
      },
      UpdateExpression: 'SET appleId = :appleId, authProvider = :authProvider, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':appleId': appleId,
        ':authProvider': 'apple',
        ':updatedAt': now,
      },
    }));

    existingUser.appleId = appleId;
    existingUser.authProvider = 'apple';
    existingUser.updatedAt = now;

    // Generate new token for the linked account
    const token = jwt.sign({ id: existingUser.userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const userResponse = { ...existingUser };
    delete userResponse.password;
    delete userResponse.PK;
    delete userResponse.SK;

    return res.status(200).json({
      user: userResponse,
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
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Calculate days since user registration
    const createdAt = new Date(user.createdAt);
    const daysSinceRegistration = Math.ceil((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const averageDailyCost = user.totalApiUsagePrice / Math.max(daysSinceRegistration, 1);

    return res.status(200).json({
      email: user.email,
      totalApiUsagePrice: user.totalApiUsagePrice,
      formattedTotalCost: `$${user.totalApiUsagePrice.toFixed(5)}`,
      daysSinceRegistration,
      averageDailyCost: averageDailyCost.toFixed(5),
      formattedAverageDailyCost: `$${averageDailyCost.toFixed(5)}`,
      registrationDate: user.createdAt.split('T')[0],
    });
  } catch (err) {
    console.error('Get API usage error:', err);
    return res.status(500).json({ msg: 'Server error fetching API usage' });
  }
};

// Update user (new function for updating user profile)
const updateUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, email } = req.body;

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ msg: 'Email already in use' });
      }
    }

    const now = new Date().toISOString();
    const updateExpressionParts = ['updatedAt = :updatedAt'];
    const expressionAttributeValues = { ':updatedAt': now };

    if (fullName !== undefined) {
      updateExpressionParts.push('fullName = :fullName');
      expressionAttributeValues[':fullName'] = fullName;
    }

    if (email && email.toLowerCase() !== user.email) {
      updateExpressionParts.push('email = :email');
      expressionAttributeValues[':email'] = email.toLowerCase();
    }

    await db.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
      UpdateExpression: 'SET ' + updateExpressionParts.join(', '),
      ExpressionAttributeValues: expressionAttributeValues,
    }));

    // Fetch updated user
    const updatedUser = await getUserById(userId);
    const userResponse = { ...updatedUser };
    delete userResponse.password;
    delete userResponse.PK;
    delete userResponse.SK;

    return res.status(200).json(userResponse);
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ msg: 'Server error updating user' });
  }
};

export { register, login, logout, getUser, appleLogin, linkAccount, getApiUsage, updateUser };
