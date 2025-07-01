# Webhook Security Guide

This guide explains how webhook authentication works in the Solana Trading Backend.

## Overview

The backend accepts webhooks from Helius for real-time price and balance updates. To ensure these webhooks are legitimate, we implement authentication using the Helius API key.

## Authentication Flow

### 1. Setting the API Key

First, set your Helius API key as a secret in SST:

```bash
npx sst secret set HeliusApiKey YOUR_ACTUAL_HELIUS_API_KEY
```

This key will be used to validate incoming webhook requests.

### 2. Configuring Helius Webhooks

When setting up webhooks in your Helius dashboard:

1. **Price Webhook URL**: 
   ```
   https://your-api.execute-api.region.amazonaws.com/production/webhook/price
   ```

2. **Balance Webhook URL**:
   ```
   https://your-api.execute-api.region.amazonaws.com/production/webhook/balance
   ```

3. **Authorization Header**:
   Configure Helius to send an Authorization header with each webhook:
   ```
   Authorization: Bearer YOUR_ACTUAL_HELIUS_API_KEY
   ```

## How It Works

### Webhook Handler Authentication

Both webhook handlers (`heliusPriceWebhook` and `heliusBalanceWebhook`) verify the authorization header:

```typescript
// Verify webhook authentication
const authHeader = event.headers["authorization"] || event.headers["Authorization"];
const expectedAuth = `Bearer ${Resource.HeliusApiKey.value}`;

if (authHeader !== expectedAuth) {
  console.error("Unauthorized webhook request");
  return {
    statusCode: 401,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Unauthorized" }),
  };
}
```

### Security Benefits

1. **Prevents Spoofing**: Only requests with the correct API key are processed
2. **Data Integrity**: Ensures price and balance data comes from legitimate sources
3. **Audit Trail**: Failed auth attempts are logged for monitoring

## Testing Webhooks

### Local Testing

For local development, you can simulate webhook calls:

```bash
# Test price webhook
curl -X POST http://localhost:3000/webhook/price \
  -H "Authorization: Bearer YOUR_HELIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "SWAP",
    "accounts": [
      {"address": "vault_sol", "nativeBalanceChange": 1000000000},
      {"address": "user", "nativeBalanceChange": -100000}
    ],
    "txSignature": "test-sig",
    "slot": 123456,
    "timestamp": 1704067200
  }'

# Test balance webhook
curl -X POST http://localhost:3000/webhook/balance \
  -H "Authorization: Bearer YOUR_HELIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
    "token": "DROP",
    "balance": 1000000,
    "slot": 123456,
    "timestamp": 1704067200
  }'
```

### Production Testing

For production webhook testing:

1. Use Helius webhook testing tools in their dashboard
2. Monitor CloudWatch logs for authentication failures
3. Set up alarms for repeated 401 responses

## Alternative Authentication Methods

### HMAC Signature Verification

For even stronger security, you could implement HMAC signature verification:

```typescript
// Example HMAC verification (not currently implemented)
import { createHmac } from 'crypto';

const signature = event.headers['x-helius-signature'];
const payload = event.body;
const secret = Resource.HeliusApiKey.value;

const expectedSignature = createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

if (signature !== expectedSignature) {
  return { statusCode: 401, body: JSON.stringify({ error: "Invalid signature" }) };
}
```

### IP Whitelisting

You could also restrict webhooks to Helius IP addresses:

```typescript
// In sst.config.ts - add WAF rules
const webAcl = new sst.aws.WAF("WebhookWAF", {
  rules: [
    {
      name: "AllowHeliusIPs",
      priority: 1,
      statement: {
        ipSetReferenceStatement: {
          arn: heliusIpSet.arn,
        },
      },
      action: { allow: {} },
    },
  ],
});
```

## Monitoring and Alerts

### CloudWatch Metrics

Monitor these metrics:
- Webhook authentication failures (401 responses)
- Webhook processing errors (500 responses)
- Webhook latency

### Example CloudWatch Alarm

```typescript
new sst.aws.Alarm("WebhookAuthFailures", {
  metric: {
    namespace: "AWS/Lambda",
    metricName: "Errors",
    dimensions: {
      FunctionName: heliusPriceWebhook.name,
    },
  },
  threshold: 10,
  evaluationPeriods: 1,
});
```

## Best Practices

1. **Rotate API Keys**: Regularly rotate your Helius API key
2. **Use HTTPS**: Always use HTTPS for webhook endpoints (enforced by API Gateway)
3. **Log Failed Attempts**: Monitor and alert on authentication failures
4. **Rate Limiting**: Implement rate limiting to prevent abuse
5. **Payload Validation**: Always validate webhook payloads with Zod schemas

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check that Helius is sending the Authorization header
   - Verify the API key matches what's stored in SST secrets
   - Check for case sensitivity in headers

2. **Missing Authentication**
   - Ensure the Lambda functions are linked to `heliusApiKey`
   - Verify the secret was set correctly: `npx sst secret list`

3. **Webhook Not Received**
   - Check Helius webhook configuration
   - Verify your API Gateway URL is correct
   - Check CloudWatch logs for the Lambda function

## Security Checklist

- [ ] Helius API key set as SST secret
- [ ] Webhook handlers linked to API key secret
- [ ] Authorization headers configured in Helius
- [ ] CloudWatch alarms set up for auth failures
- [ ] Regular API key rotation schedule
- [ ] Webhook payload validation with Zod schemas 