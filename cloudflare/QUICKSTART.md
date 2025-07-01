# Cloudflare Edge Broadcast - Quick Start Guide

This guide will get you up and running with the Cloudflare Durable Objects edge broadcast system in under 10 minutes.

## Prerequisites

- Cloudflare account with Workers Paid Plan ($5/month)
- Node.js 18+ installed
- Domain configured in Cloudflare (for custom routes)

## Step 1: Clone and Setup

```bash
# Clone the repository
git clone <your-repo>
cd <your-repo>/cloudflare

# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login
```

## Step 2: Configure Secrets

```bash
# Generate a secure webhook secret
export WEBHOOK_SECRET=$(openssl rand -base64 32)
echo "Save this secret: $WEBHOOK_SECRET"

# Set the secret in Cloudflare
npx wrangler secret put WEBHOOK_SECRET
# Paste the secret when prompted
```

## Step 3: Update Configuration

Edit `wrangler.toml`:

```toml
name = "glow-broadcast"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGINS = "https://your-app.com,http://localhost:3000"

[[routes]]
pattern = "broadcast.your-domain.com/*"
zone_name = "your-domain.com"
```

## Step 4: Deploy

```bash
# Deploy to production
npm run deploy

# Expected output:
# ✅ Published glow-broadcast
# ✅ Current Version ID: <version-id>
```

## Step 5: Test the Deployment

### Health Check
```bash
curl https://broadcast.your-domain.com/health
# Expected: {"status":"healthy","timestamp":"2024-01-01T00:00:00.000Z"}
```

### Test WebSocket Connection
```javascript
// In browser console or Node.js
const ws = new WebSocket('wss://broadcast.your-domain.com/ws/test-token');

ws.onopen = () => console.log('Connected!');
ws.onmessage = (event) => console.log('Message:', JSON.parse(event.data));
ws.onerror = (error) => console.error('Error:', error);
```

### Test Broadcast
```bash
# Send a test broadcast
curl -X POST https://broadcast.your-domain.com/broadcast/test-token \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"TEST","message":"Hello from Cloudflare!"}'
```

## Step 6: Configure AWS Backend

1. **Set SST Secrets**:
```bash
cd ../  # Back to main project
npx sst secret set EdgeBroadcastUrl https://broadcast.your-domain.com
npx sst secret set EdgeBroadcastSecret <your-webhook-secret>
```

2. **Enable Edge Broadcasting**:
```bash
# Set environment variable before deploying
export USE_EDGE_BROADCAST=true
npx sst deploy
```

## Step 7: Monitor

```bash
# Watch real-time logs
cd cloudflare
npm run tail

# Check Durable Objects
npx wrangler durable-objects list
```

## Troubleshooting

### WebSocket Connection Fails
- Check ALLOWED_ORIGINS includes your domain
- Verify DNS is pointing to Cloudflare
- Check browser console for CORS errors

### Broadcasts Not Received
- Verify webhook secret matches between AWS and Cloudflare
- Check `wrangler tail` for errors
- Ensure WebSocket clients are connected to correct token

### High Latency
- Check which Cloudflare region you're connecting to
- Consider setting up regional subdomains
- Monitor Durable Object CPU usage

## Next Steps

1. **Set up monitoring**: Configure Cloudflare Analytics
2. **Add authentication**: Implement wallet signature verification
3. **Configure rate limiting**: Use Cloudflare Rate Limiting
4. **Set up alerts**: Configure error notifications
5. **Optimize costs**: Review usage patterns and adjust

## Support

- Discord: [Your Discord]
- Email: support@your-domain.com
- Docs: https://docs.your-domain.com 