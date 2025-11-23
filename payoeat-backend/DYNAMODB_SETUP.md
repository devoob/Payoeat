# DynamoDB Setup Instructions

This document outlines the DynamoDB table structure and required Global Secondary Indexes (GSIs) for the Payoeat backend.

## Table Structure

**Table Name:** Use the value from your `DYNAMO_TABLE` environment variable

### Primary Key
- **Partition Key (PK):** `USER#${userId}` (String)
- **Sort Key (SK):** `PROFILE` (String)

### User Item Attributes
```json
{
  "PK": "USER#<uuid>",
  "SK": "PROFILE",
  "userId": "<uuid>",
  "email": "user@example.com",
  "password": "<hashed-password>",  // Optional, not present for Apple-only users
  "appleId": "<apple-id>",           // Optional, only for Apple auth users
  "fullName": "John Doe",            // Optional
  "authProvider": "local|apple",
  "totalApiUsagePrice": 0,
  "createdAt": "2025-11-18T10:30:00.000Z",
  "updatedAt": "2025-11-18T10:30:00.000Z"
}
```

## Required Global Secondary Indexes (GSIs)

### 1. EmailIndex
This index allows querying users by their email address.

- **Index Name:** `EmailIndex`
- **Partition Key:** `email` (String)
- **Sort Key:** None
- **Projection Type:** ALL (recommended) or include: PK, SK, userId, password, appleId, fullName, authProvider, totalApiUsagePrice, createdAt, updatedAt

### 2. AppleIdIndex
This index allows querying users by their Apple ID.

- **Index Name:** `AppleIdIndex`
- **Partition Key:** `appleId` (String)
- **Sort Key:** None
- **Projection Type:** ALL (recommended) or include: PK, SK, userId, email, password, fullName, authProvider, totalApiUsagePrice, createdAt, updatedAt

## Environment Variables Required

Make sure these are set in your `.env` file:

```bash
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_REGION=<your-region>  # e.g., us-east-1
DYNAMO_TABLE=<your-table-name>
JWT_SECRET=<your-jwt-secret>
```

## API Endpoints

After setting up the table and GSIs, the following endpoints will be available:

### User Management
- `POST /api/auth/register` - Create a new user
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/apple` - Login/Register with Apple
- `POST /api/auth/link-account` - Link Apple account to existing account
- `POST /api/auth/logout` - Logout (client-side token removal)
- `GET /api/auth/me` - Get current user info (requires authentication)
- `PUT /api/auth/me` - Update user profile (requires authentication)
- `GET /api/auth/api-usage` - Get user's API usage statistics (requires authentication)

## Creating the Table and GSIs

### Using AWS CLI

```bash
# Create the table
aws dynamodb create-table \
  --table-name YourTableName \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=email,AttributeType=S \
    AttributeName=appleId,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"EmailIndex\",
        \"KeySchema\": [{\"AttributeName\":\"email\",\"KeyType\":\"HASH\"}],
        \"Projection\": {\"ProjectionType\":\"ALL\"}
      },
      {
        \"IndexName\": \"AppleIdIndex\",
        \"KeySchema\": [{\"AttributeName\":\"appleId\",\"KeyType\":\"HASH\"}],
        \"Projection\": {\"ProjectionType\":\"ALL\"}
      }
    ]"
```

### Using AWS Console

1. Go to DynamoDB console
2. Click "Create table"
3. Set Table name to your `DYNAMO_TABLE` value
4. Set Partition key to `PK` (String)
5. Check "Add sort key" and set to `SK` (String)
6. Choose "On-demand" for capacity mode (or configure provisioned as needed)
7. Create the table
8. After creation, go to "Indexes" tab
9. Create GSI for email:
   - Click "Create index"
   - Partition key: `email` (String)
   - Index name: `EmailIndex`
   - Projection: All attributes
10. Create GSI for appleId:
    - Click "Create index"
    - Partition key: `appleId` (String)
    - Index name: `AppleIdIndex`
    - Projection: All attributes

## Notes

- The `userId` is a UUID v4 generated for each user
- Emails are stored in lowercase for consistency
- The `password` field is hashed using bcrypt before storage
- Users can authenticate via local (email/password) or Apple OAuth
- The `appleId` field is sparse (only exists for Apple auth users)
- All GSIs should use the same read/write capacity mode as the main table
