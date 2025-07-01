# Deployment Quick Reference

## 🚀 AWS Deployment (15 minutes)

```bash
# 1. Setup
cd server
npm install

# 2. Configure Secrets
npx sst secret set HeliusApiKey YOUR_KEY       # Used for webhook auth
npx sst secret set JupiterApiKey YOUR_KEY      # For AMM price fetching
npx sst secret set RpcUrl YOUR_RPC_URL         # Solana RPC endpoint

# 3. Deploy
npm run deploy

# 4. Test
curl https://YOUR-API.execute-api.us-east-1.amazonaws.com/health/live
```

## ⚡ Cloudflare Deployment (10 minutes)

```bash
# 1. Setup
cd cloudflare
npm install
npx wrangler login

# 2. Generate Secret
export WEBHOOK_SECRET=$(openssl rand -base64 32)
echo $WEBHOOK_SECRET  # SAVE THIS!

# 3. Configure
# Edit wrangler.toml with your domain

# 4. Deploy
npx wrangler secret put WEBHOOK_SECRET
npm run deploy

# 5. Test
curl https://broadcast.yourdomain.com/health
```

## 🔗 Connect AWS → Cloudflare (5 minutes)

```bash
# 1. Go to AWS project
cd ../server

# 2. Set Cloudflare info
npx sst secret set EdgeBroadcastUrl https://broadcast.yourdomain.com
npx sst secret set EdgeBroadcastSecret YOUR_WEBHOOK_SECRET

# 3. Enable & Deploy
export USE_EDGE_BROADCAST=true
npm run deploy
```

## ✅ Verify Integration

```bash
# Run test script
./scripts/test-integration.sh

# Or manually test
curl -X POST https://YOUR-API.execute-api.us-east-1.amazonaws.com/webhook/price \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_HELIUS_API_KEY" \
  -H "x-token: TEST_TOKEN" \
  -d '{"type":"test","timestamp":1234567890}'
```

## 🚨 Rollback

```bash
# Disable Cloudflare
export USE_EDGE_BROADCAST=false
npm run deploy

# Re-enable Cloudflare  
export USE_EDGE_BROADCAST=true
npm run deploy
```

## 📊 Monitor

```bash
# AWS Logs
aws logs tail /aws/lambda/server-production-HeliusPriceWebhook

# Cloudflare Logs
cd cloudflare && npx wrangler tail

# Test WebSocket
wscat -c wss://broadcast.yourdomain.com/ws/SOL
```

## 🔑 Key URLs

- **AWS API**: `https://YOUR-API.execute-api.us-east-1.amazonaws.com`
- **AWS WebSocket**: `wss://YOUR-WS.execute-api.us-east-1.amazonaws.com/production`
- **Cloudflare API**: `https://broadcast.yourdomain.com`
- **Cloudflare WebSocket**: `wss://broadcast.yourdomain.com/ws/TOKEN`

## 💡 Tips

1. Start with AWS only
2. Test thoroughly before enabling Cloudflare
3. Monitor costs daily for first week
4. Keep webhook secret secure
5. Use test tokens before production tokens

## 🆘 Help

- **SST Issues**: Check `npx sst doctor`
- **Cloudflare Issues**: Check `npx wrangler tail`
- **Integration Issues**: Run `./scripts/test-integration.sh`
- **WebSocket Issues**: Check CORS and origins 