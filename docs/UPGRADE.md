# Upgrade Guide: Adding Kinesis Streaming

This guide walks you through adding Kinesis streaming to your architecture when scale demands it.

## When to Upgrade

Consider adding Kinesis when you hit any of these thresholds:

- **Price Updates**: > 10 million per day (116/second average)
- **DynamoDB Costs**: > $2,000/month for PriceTimeSeriesTable
- **Analytics Needs**: Real-time dashboards or ML pipelines
- **Compliance**: Immutable audit trail requirements
- **Data Retention**: Need > 14 days of tick-by-tick data

## Architecture Changes

### Before (Current)
```
Webhook → Lambda → DynamoDB → SQS → Broadcast
```

### After (With Kinesis)
```
Webhook → Lambda → DynamoDB + Kinesis → S3 Archive
                         ↓        ↓
                        SQS    Analytics
```

## Step-by-Step Upgrade

### Step 1: Add Infrastructure (sst.config.ts)

```typescript
// Add after the messaging resources section
/* --------------------------------------------
// Streaming Resources
-------------------------------------------- */

// Kinesis Stream for raw tick fan-out
const priceTicksStream = new sst.aws.KinesisStream("PriceTicks", {
  retentionPeriod: "24 hours",
  shardCount: 2, // Start with 2, auto-scale later
});

// S3 bucket for long-term archive
const priceArchiveBucket = new sst.aws.Bucket("PriceArchiveBucket", {
  lifecycleRules: [{
    transitions: [{
      storageClass: "GLACIER",
      days: 90,
    }],
    expiration: {
      days: 2555, // 7 years for compliance
    },
  }],
});

// Kinesis Firehose for S3 delivery
const priceArchiveFirehose = new sst.aws.KinesisFirehose("PriceArchiveFirehose", {
  source: priceTicksStream,
  destination: priceArchiveBucket,
  format: "parquet", // Efficient for analytics
  compressionFormat: "SNAPPY",
  bufferInterval: 300, // 5 minutes
  bufferSize: 128, // 128 MB
});
```

### Step 2: Update Lambda Functions

#### Update webhook handlers to write to Kinesis:

```typescript
// source/webhooks/heliusPrice.ts
import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";

const kinesisClient = new KinesisClient({});

// After writing to DynamoDB, add:
await kinesisClient.send(
  new PutRecordCommand({
    StreamName: Resource.PriceTicks.name,
    PartitionKey: token,
    Data: new TextEncoder().encode(JSON.stringify({
      ...priceData,
      timestamp: Date.now(),
      version: "1.0",
    })),
  })
);
```

#### Update sst.config.ts to link Kinesis:

```typescript
const heliusPriceWebhook = new sst.aws.Function("HeliusPriceWebhook", {
  handler: "source/webhooks/heliusPrice.handler",
  link: [priceTimeSeriesTable, priceTicksStream, broadcastQueue], // Add stream
  // ... rest of config
});
```

### Step 3: Add Stream Consumers

#### Create analytics consumer:

```typescript
// source/consumers/priceAnalytics.ts
import { KinesisStreamHandler } from "aws-lambda";

export const handler: KinesisStreamHandler = async (event) => {
  for (const record of event.Records) {
    const data = JSON.parse(
      Buffer.from(record.kinesis.data, "base64").toString()
    );
    
    // Process for analytics
    // e.g., calculate moving averages, detect anomalies
    console.log("Processing price tick:", data);
  }
};
```

#### Add consumer to sst.config.ts:

```typescript
priceTicksStream.subscribe({
  function: {
    handler: "source/consumers/priceAnalytics.handler",
    timeout: "5 minutes",
  },
  startingPosition: "LATEST",
});
```

### Step 4: Implement Dual-Write Pattern

To ensure zero downtime migration:

```typescript
// Add feature flag
const USE_KINESIS = process.env.USE_KINESIS === "true";

// Dual write pattern
async function writePriceUpdate(priceData: PriceData) {
  // Always write to DynamoDB
  await dynamoClient.send(new PutCommand({
    TableName: Resource.PriceTimeSeriesTable.name,
    Item: priceData,
  }));
  
  // Conditionally write to Kinesis
  if (USE_KINESIS) {
    try {
      await kinesisClient.send(new PutRecordCommand({
        StreamName: Resource.PriceTicks.name,
        PartitionKey: priceData.token,
        Data: new TextEncoder().encode(JSON.stringify(priceData)),
      }));
    } catch (error) {
      // Log but don't fail - ensures reliability during migration
      console.error("Kinesis write failed:", error);
    }
  }
}
```

### Step 5: Deploy in Stages

#### Stage 1: Deploy Infrastructure (No Traffic)
```bash
# Deploy with Kinesis disabled
export USE_KINESIS=false
npm run deploy:prod
```

#### Stage 2: Test with Small Percentage
```bash
# Enable for 1% of traffic
export USE_KINESIS=true
export KINESIS_PERCENTAGE=1
npm run deploy:prod
```

#### Stage 3: Gradual Rollout
```bash
# Increase percentage gradually
# 1% → 10% → 50% → 100%
export KINESIS_PERCENTAGE=10
npm run deploy:prod
```

### Step 6: Add Monitoring

#### CloudWatch Alarms:

```typescript
// Add to sst.config.ts
new aws.cloudwatch.Alarm("KinesisIteratorAge", {
  metric: priceTicksStream.metricGetRecordsIteratorAge(),
  threshold: 60000, // 1 minute
  evaluationPeriods: 2,
});

new aws.cloudwatch.Alarm("KinesisThrottles", {
  metric: priceTicksStream.metricUserRecordsPut(),
  threshold: 10,
  evaluationPeriods: 1,
});
```

#### Dashboard:

```typescript
new aws.cloudwatch.Dashboard("StreamingDashboard", {
  widgets: [
    {
      type: "metric",
      properties: {
        metrics: [
          ["AWS/Kinesis", "IncomingRecords", { stat: "Sum" }],
          ["AWS/Kinesis", "GetRecords.IteratorAgeMilliseconds", { stat: "Maximum" }],
          ["AWS/DynamoDB", "UserErrors", { stat: "Sum" }],
        ],
        period: 300,
        region: "us-east-1",
      },
    },
  ],
});
```

### Step 7: Query Historical Data

#### Set up Athena for S3 queries:

```sql
-- Create external table
CREATE EXTERNAL TABLE price_history (
  token string,
  price double,
  timestamp bigint,
  source string,
  slot bigint
)
STORED AS PARQUET
LOCATION 's3://your-bucket/price-archive/'
PARTITIONED BY (year int, month int, day int);

-- Query example
SELECT 
  token,
  AVG(price) as avg_price,
  MIN(price) as min_price,
  MAX(price) as max_price
FROM price_history
WHERE year = 2024 AND month = 3
GROUP BY token;
```

### Step 8: Optimize Costs

#### Auto-scaling for Kinesis:

```typescript
// Use Application Auto Scaling
const scalingTarget = new aws.appautoscaling.Target("KinesisScaling", {
  serviceNamespace: "kinesis",
  resourceId: `stream/${priceTicksStream.name}`,
  scalableDimension: "kinesis:stream:shard:count",
  minCapacity: 2,
  maxCapacity: 10,
});

new aws.appautoscaling.Policy("KinesisScalingPolicy", {
  policyType: "TargetTrackingScaling",
  targetTrackingScalingPolicyConfiguration: {
    targetValue: 70,
    predefinedMetricSpecification: {
      predefinedMetricType: "IncomingRecordsPerInstance",
    },
  },
});
```

#### Optimize DynamoDB after migration:

```typescript
// Reduce DynamoDB retention since Kinesis handles archival
const priceTimeSeriesTable = new sst.aws.Dynamo("PriceTimeSeriesTable", {
  // ... existing config
  ttl: "ttl", // Reduce from 14 days to 7 days
});
```

## Rollback Plan

If issues arise, rollback is simple:

1. Set `USE_KINESIS=false`
2. Redeploy
3. All data continues flowing through DynamoDB only

## Cost Estimation

### Additional Monthly Costs:
- **Kinesis Data Streams**: ~$150 (2 shards)
- **Kinesis Firehose**: ~$100
- **S3 Storage**: ~$50 (compressed Parquet)
- **Athena Queries**: ~$5-50 (depends on usage)
- **Total**: ~$300-350/month additional

### Cost Savings:
- Reduced DynamoDB storage: -$200/month
- Net increase: ~$100-150/month

## Performance Improvements

After adding Kinesis:
- **Analytics Latency**: Real-time (vs hourly)
- **Historical Queries**: Seconds (vs minutes)
- **Data Retention**: 7 years (vs 14 days)
- **Throughput**: 100K+ records/second

## Common Issues & Solutions

### Issue 1: Kinesis Throttling
```bash
# Increase shards
aws kinesis update-shard-count \
  --stream-name PriceTicks \
  --target-shard-count 4
```

### Issue 2: Firehose Delivery Delays
```typescript
// Reduce buffer time for real-time needs
bufferInterval: 60, // 1 minute instead of 5
```

### Issue 3: High Costs
```typescript
// Use on-demand pricing for variable workloads
const priceTicksStream = new sst.aws.KinesisStream("PriceTicks", {
  streamModeDetails: {
    streamMode: "ON_DEMAND",
  },
});
```

## Validation Checklist

- [ ] Kinesis stream receiving records
- [ ] S3 files being created every 5 minutes
- [ ] No increase in Lambda errors
- [ ] DynamoDB writes still working
- [ ] WebSocket broadcasts unchanged
- [ ] Costs within budget
- [ ] Athena queries returning data

## Next Steps

Once Kinesis is running smoothly:

1. **Add ML Pipeline**: Connect SageMaker to Kinesis
2. **Real-time Alerts**: Use Kinesis Analytics
3. **Global Replication**: Cross-region streams
4. **Advanced Analytics**: Connect to Redshift

Remember: This upgrade is designed to be done gradually with zero downtime. Take your time and monitor each stage! 