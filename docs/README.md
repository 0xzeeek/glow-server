# Documentation Index

Welcome to the Solana Trading Backend documentation!

## 📚 Documentation Structure

### Getting Started
- [AWS-Only Quick Start](AWS-ONLY-QUICKSTART.md) - Get running with just AWS in 10 minutes
- [Deployment Quick Reference](DEPLOYMENT-QUICK-REFERENCE.md) - Quick commands cheat sheet

### Frontend Integration
- [React Native Integration Guide](REACT-NATIVE-INTEGRATION.md) - Complete guide for mobile app developers
- [Image Upload Guide](IMAGE-UPLOAD-GUIDE.md) - How to upload images from React Native

### Architecture
- [Architecture Overview](ARCHITECTURE.md) - Simplified architecture and data flow
- [Upgrade Guide](UPGRADE.md) - How to add Kinesis streaming when you scale

### Security
- [Webhook Security Guide](WEBHOOK-SECURITY.md) - How webhook authentication works

### Cloudflare Integration
- [AWS + Cloudflare Integration](AWS-CLOUDFLARE-INTEGRATION.md) - Complete guide to using both systems
- [Cloudflare README](../cloudflare/README.md) - Detailed Cloudflare Durable Objects documentation
- [Cloudflare Quick Start](../cloudflare/QUICKSTART.md) - Quick deployment guide for Cloudflare

### Testing
- [Integration Test Script](../scripts/test-integration.sh) - Automated testing for both systems

## 🚀 Recommended Reading Order

1. **Just Starting?**
   - Read [AWS-Only Quick Start](AWS-ONLY-QUICKSTART.md)
   - Follow [Deployment Quick Reference](DEPLOYMENT-QUICK-REFERENCE.md)

2. **Building the Mobile App?**
   - Read [React Native Integration Guide](REACT-NATIVE-INTEGRATION.md)
   - Review the WebSocket and REST API sections

3. **Understanding the System**
   - Review [Architecture Overview](ARCHITECTURE.md)
   - Check the main [README](../README.md)

4. **Ready for Global Scale?**
   - Study [AWS + Cloudflare Integration](AWS-CLOUDFLARE-INTEGRATION.md)
   - Deploy using [Cloudflare Quick Start](../cloudflare/QUICKSTART.md)

5. **Planning for Growth**
   - Review [Upgrade Guide](UPGRADE.md) for Kinesis addition

## 📊 Quick Decision Tree

```
Are you a frontend developer?
├─ Yes → Start with REACT-NATIVE-INTEGRATION.md
└─ No → Continue below

Do you need < 50ms global latency?
├─ No → Use AWS only (start here!)
│   └─ See AWS-ONLY-QUICKSTART.md
└─ Yes → Add Cloudflare
    └─ See AWS-CLOUDFLARE-INTEGRATION.md

Will you have > 10M price updates/day?
├─ No → Current setup is perfect
└─ Yes → Plan for Kinesis
    └─ See UPGRADE.md
```

## 🔗 External Resources

- [SST Documentation](https://docs.sst.dev/)
- [AWS WebSocket API Guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api.html)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [React Native](https://reactnative.dev/)

## 💡 Tips

- Frontend devs: Start with the React Native guide for code examples
- Backend devs: Deploy AWS first, then add Cloudflare if needed
- Monitor costs daily for the first week
- Use the test script after each deployment
- Keep your webhook secrets secure! 