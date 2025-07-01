import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";

const dynamoClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

interface TokenInfo {
  token: string;
  ammPool: string;
}

// Jupiter API endpoint
const JUPITER_API_URL = "https://quote-api.jup.ag/v6/price";

async function fetchPriceForToken(tokenAddress: string): Promise<void> {
  try {
    const response = await fetch(`${JUPITER_API_URL}?ids=${tokenAddress}`, {
      headers: {
        "Accept": "application/json",
        "X-API-KEY": process.env.JUPITER_API_KEY || "",
      },
    });
    
    if (!response.ok) {
      console.error(`Jupiter API error for ${tokenAddress}: ${response.status}`);
      return;
    }
    
    const priceData = await response.json() as { data: Record<string, { price: number }> };
    const price = priceData.data?.[tokenAddress]?.price || 0;
    
    if (price === 0) {
      console.log(`No price found for ${tokenAddress}`);
      return;
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date();
    const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
    const ttl = timestamp + (14 * 24 * 60 * 60); // 14 days
    
    // Write to DynamoDB
    await dynamoClient.send(
      new PutCommand({
        TableName: Resource.PriceTimeSeriesTable.name,
        Item: {
          tokenDate: `${tokenAddress}#${dateStr}`,
          timestamp,
          price,
          source: "jupiter",
          slot: 0, // Jupiter doesn't provide slot
          txSignature: "",
          ttl,
        },
      })
    );
    
    // Note: Removed Kinesis streaming for simplicity
    // Can be added back when scale requires it
    
    // Send to broadcast queue
    const broadcastMessage = {
      type: "PRICE_UPDATE",
      token: tokenAddress,
      price,
      timestamp,
    };
    
    await sqsClient.send(
      new SendMessageBatchCommand({
        QueueUrl: Resource.BroadcastQueue.url,
        Entries: [
          {
            Id: tokenAddress,
            MessageBody: JSON.stringify({
              connectionIds: [],
              message: broadcastMessage,
            }),
          },
        ],
      })
    );
    
    console.log(`Updated price for ${tokenAddress}: ${price}`);
  } catch (error) {
    console.error(`Error fetching price for ${tokenAddress}:`, error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  try {
    // Handle Step Functions invocations
    if (event?.action === "getTokenList") {
      // Return list of AMM tokens for Step Functions Map
      const tokensResult = await dynamoClient.send(
        new QueryCommand({
          TableName: Resource.TokensTable.name,
          IndexName: "byPhase",
          KeyConditionExpression: "phase = :phase",
          ExpressionAttributeValues: {
            ":phase": "amm",
          },
        })
      );
      
      const tokens = (tokensResult.Items || []) as TokenInfo[];
      return {
        tokens: tokens.map(t => t.token),
      };
    }
    
    if (event?.action === "fetchPrice" && event?.token) {
      // Fetch price for a single token (called by Step Functions Map)
      await fetchPriceForToken(event.token);
      return { success: true, token: event.token };
    }
    
    // Default behavior: fetch all AMM token prices (for direct cron invocation)
    const tokensResult = await dynamoClient.send(
      new QueryCommand({
        TableName: Resource.TokensTable.name,
        IndexName: "byPhase",
        KeyConditionExpression: "phase = :phase",
        ExpressionAttributeValues: {
          ":phase": "amm",
        },
      })
    );
    
    const tokens = (tokensResult.Items || []) as TokenInfo[];
    
    if (tokens.length === 0) {
      console.log("No tokens in AMM phase");
      return;
    }
    
    // Batch fetch prices from Jupiter
    const tokenAddresses = tokens.map(t => t.token);
    const batchSize = 50; // Jupiter API limit
    
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      
      // Process tokens in parallel within each batch
      await Promise.all(batch.map(token => fetchPriceForToken(token)));
      
      // Add delay to respect rate limits
      if (i + batchSize < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
  } catch (error) {
    console.error("Error in fetchAMMPrice job:", error);
    throw error;
  }
}; 