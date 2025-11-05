import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

const getApplePublicKey = (kid) => {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        const signingKey = key.publicKey || key.rsaPublicKey;
        resolve(signingKey);
      }
    });
  });
};

export const verifyAppleToken = async (identityToken) => {
  try {
    // Decode the token header to get the key ID
    const decoded = jwt.decode(identityToken, { complete: true });
    
    if (!decoded || !decoded.header.kid) {
      throw new Error('Invalid token format');
    }

    console.log('Expected audience:', process.env.APPLE_CLIENT_ID);
    console.log('Token payload audience:', decoded.payload.aud);

    // Get the public key from Apple
    const publicKey = await getApplePublicKey(decoded.header.kid);

    // Verify the token
    const payload = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      audience: process.env.APPLE_CLIENT_ID || 'host.exp.Exponent',
      issuer: 'https://appleid.apple.com',
    });

    return payload;
  } catch (error) {
    throw new Error(`Apple token verification failed: ${error.message}`);
  }
};