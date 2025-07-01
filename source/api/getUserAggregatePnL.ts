import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});

// Helper to get date range
function getDateRange(range: string): { start: number; end: number } {
  const end = Math.floor(Date.now() / 1000);
  let start = end;
  
  switch (range) {
    case "1h":
      start = end - 3600;
      break;
    case "1d":
      start = end - 86400;
      break;
    case "7d":
      start = end - (7 * 86400);
      break;
    case "30d":
      start = end - (30 * 86400);
      break;
    default:
      start = end - 86400; // Default to 1 day
  }
  
  return { start, end };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const wallet = event.pathParameters?.wallet;
    const range = event.queryStringParameters?.range || "1d";
    
    if (!wallet) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "wallet parameter is required" }),
      };
    }
    
    const { start, end } = getDateRange(range);
    
    // Get user data to find all tokens they own
    const userResult = await client.send(
      new GetCommand({
        TableName: Resource.UsersTable.name,
        Key: { wallet },
      })
    );
    
    if (!userResult.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "User not found" }),
      };
    }
    
    // For this example, we'll query a few known tokens
    // In production, you'd maintain a list of user's tokens
    const tokens = ["DROP", "MEME", "DOGE"]; // Example tokens
    
    let totalStartValue = 0;
    let totalEndValue = 0;
    const breakdown: Array<{ token: string; deltaUsd: number }> = [];
    
    // Query balance snapshots for each token
    for (const token of tokens) {
      const result = await client.send(
        new QueryCommand({
          TableName: Resource.BalanceSnapshotsTable.name,
          KeyConditionExpression: "walletToken = :walletToken AND #ts BETWEEN :start AND :end",
          ExpressionAttributeNames: {
            "#ts": "timestamp",
          },
          ExpressionAttributeValues: {
            ":walletToken": `${wallet}#${token}`,
            ":start": start,
            ":end": end,
          },
          ScanIndexForward: true,
        })
      );
      
      if (result.Items && result.Items.length > 0) {
        const firstSnapshot = result.Items[0];
        const lastSnapshot = result.Items[result.Items.length - 1];
        
        const startValue = firstSnapshot.valueUsd || 0;
        const endValue = lastSnapshot.valueUsd || 0;
        const delta = endValue - startValue;
        
        totalStartValue += startValue;
        totalEndValue += endValue;
        
        if (delta !== 0) {
          breakdown.push({
            token,
            deltaUsd: parseFloat(delta.toFixed(2)),
          });
        }
      }
    }
    
    const totalDelta = totalEndValue - totalStartValue;
    const deltaPct = totalStartValue > 0 ? (totalDelta / totalStartValue) * 100 : 0;
    
    // Sort breakdown by absolute delta value
    breakdown.sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd));
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        range,
        startValueUsd: parseFloat(totalStartValue.toFixed(2)),
        endValueUsd: parseFloat(totalEndValue.toFixed(2)),
        deltaUsd: parseFloat(totalDelta.toFixed(2)),
        deltaPct: parseFloat(deltaPct.toFixed(2)),
        breakdown,
      }),
    };
    
  } catch (error) {
    console.error("Error getting user aggregate P&L:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 