# Cloudflare Durable Objects - Edge Broadcast System

This is the Cloudflare Workers + Durable Objects implementation for ultra-low latency WebSocket broadcasting. It provides an alternative to the AWS SQS-based broadcast system, enabling global edge-based message distribution.

## Architecture Overview

### Components

1. **Worker Routes**:
   - `POST /broadcast/:token` - REST endpoint for Lambda webhooks to send price updates
   - `GET /ws/:token` - WebSocket endpoint for client connections
   - `GET /health` - Health check endpoint

2. **Durable Object (`BroadcastRoom`)**:
   - Manages up to 32,000 WebSocket connections per token
   - Hibernates when idle (zero cost when no connections)
   - Automatic connection cleanup and health monitoring
   - Sub-millisecond message broadcasting

### Benefits Over AWS Broadcast

- **Lower Latency**: Messages delivered from nearest edge location (< 50ms globally)
- **Cost Efficiency**: Only pay when active, hibernates when idle
- **Scalability**: Each token gets dedicated compute at the edge
- **Simplicity**: No queue management, direct WebSocket handling

## Setup & Deployment

### Prerequisites

1. **Cloudflare Account** with Workers Paid Plan ($5/month)
2. **Node.js** 18+ and npm
3. **Wrangler CLI** (installed via npm)

### Installation

```bash
cd cloudflare
npm install
```

### Configuration

1. **Update `wrangler.toml`**:
```toml
name = "glow-broadcast"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
WEBHOOK_SECRET = "your-secure-webhook-secret"
ALLOWED_ORIGINS = "https://app.glow.trade,http://localhost:3000"

[[routes]]
pattern = "broadcast.glow.trade/*"
zone_name = "glow.trade"
```

2. **Create Secrets**:
```bash
# Set webhook secret for Lambda authentication
wrangler secret put WEBHOOK_SECRET
# Enter your secret when prompted
```

### Deployment

```bash
# Deploy to production
npm run deploy

# Or deploy to a specific environment
wrangler deploy --env staging
```

### Verify Deployment

```bash
# Check health endpoint
curl https://broadcast.glow.trade/health

# Monitor logs
npm run tail
```

## Integration with AWS Backend

### 1. Update Lambda Environment Variables

Add to your SST configuration:
```typescript
// sst.config.ts
const edgeBroadcastUrl = new sst.Secret("EdgeBroadcastUrl");
const edgeBroadcastSecret = new sst.Secret("EdgeBroadcastSecret");

// In your webhook handler
environment: {
  USE_EDGE_BROADCAST: "true",
  EDGE_BROADCAST_URL: edgeBroadcastUrl.value,
  EDGE_BROADCAST_SECRET: edgeBroadcastSecret.value,
}
```

### 2. Update Webhook Handlers

Modify `source/webhooks/heliusPrice.ts` to support edge broadcasting:

```typescript
// Add edge broadcast support
if (process.env.USE_EDGE_BROADCAST === "true") {
  const edgeUrl = `${process.env.EDGE_BROADCAST_URL}/broadcast/${token}`;
  
  await fetch(edgeUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.EDGE_BROADCAST_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "PRICE_UPDATE",
      token,
      price,
      timestamp,
      slot,
      signature: txSignature,
    }),
  });
} else {
  // Existing SQS logic
}
```

### 3. Update Client WebSocket Connection

```typescript
// Mobile app WebSocket connection
const token = "So11111111111111111111111111111111111111112"; // SOL
const ws = new WebSocket(`wss://broadcast.glow.trade/ws/${token}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case "connected":
      console.log("Connected to edge:", data.connectionId);
      break;
      
    case "PRICE_UPDATE":
      updatePriceDisplay(data.price, data.timestamp);
      break;
  }
};

// Keep connection alive
setInterval(() => {
  ws.send(JSON.stringify({ type: "ping" }));
}, 30000);
```

## Usage Patterns

### 1. Direct Token Subscription
```javascript
// Subscribe to specific token prices
const ws = new WebSocket(`wss://broadcast.glow.trade/ws/${tokenMint}`);
```

### 2. Multiple Token Subscriptions
```javascript
// Open multiple connections for different tokens
const tokens = ["SOL", "BONK", "WIF"];
const connections = tokens.map(token => 
  new WebSocket(`wss://broadcast.glow.trade/ws/${token}`)
);
```

### 3. Broadcasting from Lambda
```javascript
// Send price update to all connected clients
await fetch(`https://broadcast.glow.trade/broadcast/${token}`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${WEBHOOK_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "PRICE_UPDATE",
    price: 125.45,
    timestamp: Date.now(),
  }),
});
```

## Monitoring & Debugging

### Real-time Logs
```bash
# Stream live logs
wrangler tail

# Filter by IP or status
wrangler tail --ip-address 1.2.3.4
wrangler tail --status 200
```

### Metrics via Analytics Engine
```javascript
// Add to BroadcastRoom class
private async logMetrics(event: string, properties: Record<string, any>) {
  if (this.env.ANALYTICS) {
    this.env.ANALYTICS.writeDataPoint({
      blobs: [event],
      doubles: [properties.value || 1],
      indexes: [this.token],
    });
  }
}
```

### Durable Object Inspector
```bash
# List all Durable Objects
wrangler durable-objects list

# Get specific object details
wrangler durable-objects get BROADCAST_ROOM <token>
```

## Performance Optimization

### 1. Connection Pooling
- Reuse WebSocket connections across price updates
- Implement exponential backoff for reconnections

### 2. Message Batching
```typescript
// Batch multiple updates
const updates = [];
let batchTimer: NodeJS.Timeout;

function queueUpdate(update: any) {
  updates.push(update);
  
  if (!batchTimer) {
    batchTimer = setTimeout(sendBatch, 10); // 10ms batch window
  }
}

async function sendBatch() {
  if (updates.length > 0) {
    await broadcast({ type: "BATCH_UPDATE", updates });
    updates.length = 0;
  }
  batchTimer = null;
}
```

### 3. Regional Routing
```toml
# Route traffic to nearest region
[[routes]]
pattern = "broadcast-us.glow.trade/*"
zone_name = "glow.trade"

[[routes]]
pattern = "broadcast-eu.glow.trade/*"
zone_name = "glow.trade"

[[routes]]
pattern = "broadcast-asia.glow.trade/*"
zone_name = "glow.trade"
```

## Cost Analysis

### Cloudflare Workers Pricing
- **Requests**: $0.15 per million requests after 10M free
- **Duration**: $0.02 per million GB-seconds
- **Durable Objects**: 
  - $0.15 per million requests
  - $0.20 per GB-month storage
  - Free when hibernating

### Example Cost Calculation (100K users)
```
Daily active users: 100,000
Average connections per user: 2 tokens
WebSocket messages per minute: 2 (price updates)
Daily messages: 100K * 2 * 2 * 60 * 24 = 576M messages

Monthly cost:
- Worker requests: 576M * 30 * $0.15/M = $2,592
- Durable Object requests: 576M * 30 * $0.15/M = $2,592
- Compute time: ~$100
- Total: ~$5,284/month
```

### Cost Optimization Tips
1. Use hibernation aggressively
2. Batch updates when possible
3. Implement client-side reconnection backoff
4. Use regional routing to minimize latency

## Troubleshooting

### Common Issues

1. **WebSocket Connection Fails**
   - Check ALLOWED_ORIGINS in wrangler.toml
   - Verify SSL certificates
   - Check client WebSocket support

2. **Messages Not Received**
   - Verify webhook secret matches
   - Check Durable Object is running: `wrangler tail`
   - Ensure token format is correct

3. **High Latency**
   - Check regional routing
   - Monitor Durable Object CPU usage
   - Consider message batching

### Debug Mode
```typescript
// Enable debug logging in development
if (env.ENVIRONMENT === "development") {
  console.log("Debug: Broadcast message", message);
  console.log("Debug: Active connections", this.connections.size);
}
```

## Security Best Practices

1. **Webhook Authentication**
   - Use strong, rotating secrets
   - Implement request signing
   - Add rate limiting

2. **WebSocket Security**
   - Validate origin headers
   - Implement connection limits per IP
   - Add message size limits

3. **DDoS Protection**
   - Enable Cloudflare DDoS protection
   - Implement connection rate limiting
   - Use Cloudflare Access for additional auth

## Migration Guide

### From AWS to Edge Broadcast

1. **Gradual Migration**:
   ```typescript
   // Start with percentage-based routing
   const useEdge = Math.random() < 0.1; // 10% to edge
   if (useEdge) {
     await sendToEdge(message);
   } else {
     await sendToSQS(message);
   }
   ```

2. **Dual Broadcasting**:
   ```typescript
   // Send to both during transition
   await Promise.all([
     sendToEdge(message),
     sendToSQS(message),
   ]);
   ```

3. **Client Migration**:
   - Update WebSocket URLs gradually
   - Implement fallback connections
   - Monitor connection success rates

## Support & Resources

- **Cloudflare Docs**: https://developers.cloudflare.com/workers/
- **Durable Objects Guide**: https://developers.cloudflare.com/workers/learning/using-durable-objects/
- **Discord Community**: https://discord.gg/cloudflaredev
- **Status Page**: https://www.cloudflarestatus.com/ 