# GLOW SERVER

A serverless AWS + Cloudflare Edge backend for a mobile-first meme-coin trading app on Solana.

## 🚀 Quick Start

Choose your path:
1. **Frontend Developer?** → Check out the [React Native Integration Guide](docs/REACT-NATIVE-INTEGRATION.md)
2. **AWS Only (Recommended Start)** → See [AWS Quick Start Guide](docs/AWS-ONLY-QUICKSTART.md)
3. **AWS + Cloudflare** → See [Integration Guide](docs/AWS-CLOUDFLARE-INTEGRATION.md)

## 📱 For Frontend Developers

We've created a comprehensive [React Native Integration Guide](docs/REACT-NATIVE-INTEGRATION.md) that includes:
- Complete WebSocket connection examples
- Authentication with Solana wallets
- Real-time price and balance subscriptions
- REST API integration with TypeScript
- State management patterns
- Error handling and reconnection logic
- Production-ready code examples

Quick test: `node scripts/test-react-native-client.js`

## 📚 Documentation

For detailed guides and documentation, see the [`docs/`](docs/) folder:
- [Quick Start Guide](docs/AWS-ONLY-QUICKSTART.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Deployment Reference](docs/DEPLOYMENT-QUICK-REFERENCE.md)
- [Full Documentation Index](docs/README.md)

## Architecture Overview

This backend provides:
- Real-time price streaming via WebSocket
- Millisecond-fresh price and balance updates  
- Time-series price data storage
- Compliance-ready data archival
- Global low-latency delivery (< 100ms 95th percentile)
- Cost-optimized for 100K+ concurrent users

### Broadcasting Options

1. **AWS SQS + Lambda** (Default)
   - Traditional AWS-based broadcasting
   - Uses SQS queue with Lambda workers
   - ~100-200ms broadcast latency

2. **Cloudflare Durable Objects** (Optional)
   - Edge-based WebSocket broadcasting
   - Ultra-low latency (< 50ms globally)
   - Zero cost when idle (hibernation)
   - See [`cloudflare/README.md`](cloudflare/README.md) for setup

## Key Components

### DynamoDB Tables
1. **PriceConnectionsTable** - Maps WebSocket connections to subscribed tokens
2. **BalanceConnectionsTable** - Maps WebSocket connections to wallet addresses
3. **PriceTimeSeriesTable** - 14-day hot cache of price data
4. **BalanceSnapshotsTable** - Immutable balance snapshots for P&L calculations
5. **TokensTable** - Token metadata with phase tracking (bonding/AMM)
6. **UsersTable** - User profiles and referral tracking
7. **WebsocketNonceTable** - One-time auth nonces for WebSocket connections

### Messaging
- **SQS Queue** - Decouples price writers from WebSocket broadcast

### Storage
- **TokenMetadataBucket** - S3 bucket for token images
- **UserProfileBucket** - S3 bucket for user profile pictures
- Presigned URLs for secure direct uploads from mobile apps

### APIs
- **WebSocket API** - Real-time price and balance subscriptions
- **REST API** - Token metadata, user profiles, historical prices

## Getting Started

### Prerequisites
- Node.js 18+
- AWS CLI configured
- SST v3.17+

### Installation
```bash
npm install
```

### Local Development
```bash
npm run sst
```

### Deployment
```bash
# Deploy to dev
npm run deploy:dev

# Deploy to production  
npm run deploy:prod
```

### Environment Variables
Set these secrets in SST:
```bash
npx sst secret set HeliusApiKey YOUR_HELIUS_API_KEY
npx sst secret set JupiterApiKey YOUR_JUPITER_API_KEY
npx sst secret set RpcUrl YOUR_SOLANA_RPC_URL

# Optional: For Cloudflare Edge Broadcasting
npx sst secret set EdgeBroadcastUrl https://broadcast.your-domain.com
npx sst secret set EdgeBroadcastSecret YOUR_WEBHOOK_SECRET
```

To enable edge broadcasting:
```bash
export USE_EDGE_BROADCAST=true
npx sst deploy
```

## API Documentation

### WebSocket API

#### Connect
```javascript
const ws = new WebSocket('wss://your-api-id.execute-api.region.amazonaws.com/production');

// Connection requires wallet signature authentication
ws.on('open', () => {
  // Connected
});
```

#### Subscribe to Price Updates
```javascript
ws.send(JSON.stringify({
  action: 'subscribePrice',
  token: 'DROP'
}));

// Receive updates
ws.on('message', (data) => {
  const update = JSON.parse(data);
  // { type: 'PRICE_UPDATE', token: 'DROP', price: 0.00007345, timestamp: 1724101800 }
});
```

### REST API

#### Get Latest Price
```bash
GET /tokens/{mint}/price

Response:
{
  "token": "DROP",
  "price": 0.00007345,
  "source": "amm",
  "timestamp": 1724101800
}
```

#### Get Historical Prices
```bash
GET /tokens/{mint}/prices?range=1d

Response:
{
  "token": "DROP",
  "range": "1d",
  "points": [
    { "timestamp": 1724015400, "price": 0.00006210 },
    { "timestamp": 1724047200, "price": 0.00006789 }
  ]
}
```

#### Upload Token Image
```bash
POST /tokens/{mint}/image

Response:
{
  "uploadUrl": "https://presigned-s3-url...",
  "publicUrl": "https://bucket.s3.amazonaws.com/tokens/{mint}/image.webp",
  "key": "tokens/{mint}/image-1234567890.webp",
  "expiresIn": 3600
}
```

#### Upload User Profile Image
```bash
POST /users/{wallet}/image

Response:
{
  "uploadUrl": "https://presigned-s3-url...",
  "publicUrl": "https://bucket.s3.amazonaws.com/users/{wallet}/profile.webp",
  "key": "users/{wallet}/profile-1234567890.webp",
  "expiresIn": 3600
}
```

## Data Flow

1. **Price Updates**
   - Helius webhook → Lambda handler
   - Write to DynamoDB
   - Fan-out via SQS → WebSocket broadcast

2. **Historical Data**
   - All data stored in DynamoDB with TTL
   - 14-day hot cache for recent prices
   - Older data auto-expires via TTL

3. **Real-time Broadcast**
   - AWS path: SQS → Lambda → API Gateway Management API
   - Edge path: Direct to Cloudflare Durable Objects (optional)

## Cost Optimization

At 100K concurrent users:
- API Gateway WebSocket: ~$1,800/month
- Lambda: ~$300/month
- DynamoDB: ~$800/month (on-demand, includes historical data)
- SQS: ~$50/month
- Total: ~$2,950/month

## Monitoring

Key metrics to track:
- WebSocket connection count
- Lambda p99 latency
- DynamoDB throttles and consumed capacity
- SQS message age and DLQ count
- Broadcast success rate

## Security

- Wallet-based authentication via Solana signature verification
- Webhook authentication using Helius API key
- TTL-based cleanup for stale connections
- KMS encryption for all data at rest
- IAM least-privilege policies
- WAF rate limiting (500 req/5min per IP)

## Development Notes

The `Resource` object references in Lambda functions are dynamically generated by SST at build time. TypeScript errors for `Resource.TableName.name` are expected in the IDE but will work at runtime.

## License

MIT 
