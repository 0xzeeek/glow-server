import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
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
    const token = event.queryStringParameters?.token;
    const range = event.queryStringParameters?.range || "1d";
    
    if (!wallet) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "wallet parameter is required" }),
      };
    }
    
    if (!token) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "token parameter is required" }),
      };
    }
    
    const { start, end } = getDateRange(range);
    
    // Query balance snapshots for the wallet and token
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
        ScanIndexForward: true, // Sort ascending by timestamp
      })
    );
    
    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No balance data found for the specified period" }),
      };
    }
    
    // Get first and last snapshots
    const firstSnapshot = result.Items[0];
    const lastSnapshot = result.Items[result.Items.length - 1];
    
    const startValueUsd = firstSnapshot.valueUsd || 0;
    const endValueUsd = lastSnapshot.valueUsd || 0;
    const deltaUsd = endValueUsd - startValueUsd;
    const deltaPct = startValueUsd > 0 ? (deltaUsd / startValueUsd) * 100 : 0;
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        token,
        range,
        startValueUsd: parseFloat(startValueUsd.toFixed(2)),
        endValueUsd: parseFloat(endValueUsd.toFixed(2)),
        deltaUsd: parseFloat(deltaUsd.toFixed(2)),
        deltaPct: parseFloat(deltaPct.toFixed(2)),
      }),
    };
    
  } catch (error) {
    console.error("Error getting user P&L:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 