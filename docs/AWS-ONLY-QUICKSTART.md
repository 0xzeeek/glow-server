# AWS-Only Quick Start (No Cloudflare Needed!)

This guide gets you running with just AWS in 10 minutes. **You don't need Cloudflare at all!**

## Step 1: Set Required Secrets Only

```bash
# Only these 3 secrets are required:
npx sst secret set HeliusApiKey YOUR_HELIUS_API_KEY
npx sst secret set JupiterApiKey YOUR_JUPITER_API_KEY  
npx sst secret set RpcUrl https://api.mainnet-beta.solana.com

# For the Cloudflare secrets, just set dummy values for now:
npx sst secret set EdgeBroadcastUrl "not-used"
npx sst secret set EdgeBroadcastSecret "not-used"
```

## Step 2: Deploy

```bash
# Make sure USE_EDGE_BROADCAST is false (default)
npm run deploy
```

## Step 3: Test Everything Works

```bash
# Get your API URL from the deploy output
# Then test:

# 1. Health check
curl https://YOUR-API.execute-api.us-east-1.amazonaws.com/health/live

# 2. Test WebSocket
wscat -c wss://YOUR-WS.execute-api.us-east-1.amazonaws.com/production

# 3. Test price webhook
curl -X POST https://YOUR-API.execute-api.us-east-1.amazonaws.com/webhook/price \
  -H "Content-Type: application/json" \
  -H "x-token: SOL" \
  -d '{
    "type": "PRICE_UPDATE",
    "accounts": [
      {"address": "vault_sol", "nativeBalanceChange": 1000000000},
      {"address": "user", "nativeBalanceChange": -1000000}
    ],
    "txSignature": "test123",
    "slot": 123456,
    "timestamp": 1234567890
  }'
```

## How It Works (AWS-Only Mode)

```
Helius Webhook → Lambda → DynamoDB → SQS → Broadcast Worker → WebSocket Clients
```

All broadcasting happens through AWS:
- Price updates go to SQS queue
- Broadcast worker reads from queue
- Sends to connected WebSocket clients via API Gateway

## What You Get

✅ **Working Features:**
- Real-time price updates via WebSocket
- REST API for historical prices
- User profiles and P&L tracking
- Automatic price fetching from Jupiter
- WebSocket authentication

❌ **Not Included (Until You Add Cloudflare):**
- Sub-50ms global latency
- 32K connections per token
- Edge-based broadcasting

## Common Questions

**Q: Do I need to set up Cloudflare now?**
A: No! Everything works with just AWS.

**Q: Why set dummy values for Edge secrets?**
A: SST requires all secrets to be set, but the code ignores them when USE_EDGE_BROADCAST=false.

**Q: When should I add Cloudflare?**
A: When you need < 100ms latency globally or > 10K concurrent connections.

**Q: Will it break if Cloudflare secrets are wrong?**
A: No! The code checks and falls back to AWS automatically.

## Next Steps

1. **Use AWS for 1-2 weeks** - Get comfortable with the system
2. **Monitor performance** - Check your latency and costs
3. **Add Cloudflare later** - When you need global low-latency

## Verify Everything Works

Run this quick test:

```bash
# 1. Connect WebSocket
wscat -c wss://YOUR-WS.execute-api.us-east-1.amazonaws.com/production

# 2. In another terminal, subscribe to a price
{"action": "subscribePrice", "token": "SOL"}

# 3. Send a test price update
curl -X POST https://YOUR-API.execute-api.us-east-1.amazonaws.com/webhook/price \
  -H "Content-Type: application/json" \
  -H "x-token: SOL" \
  -d '{"type":"test","accounts":[{"address":"vault_sol","nativeBalanceChange":1000000000},{"address":"user","nativeBalanceChange":-1000000}],"txSignature":"test","slot":123,"timestamp":1234567890}'

# You should see the price update in your WebSocket terminal!
```

## That's It! 🎉

Your AWS backend is fully functional without Cloudflare. When you're ready for edge performance, follow the [AWS-CLOUDFLARE-INTEGRATION.md](AWS-CLOUDFLARE-INTEGRATION.md) guide. 