import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});

// Helper to get date range
function getDateRange(range: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  
  switch (range) {
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "1d":
      start.setDate(start.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setDate(start.getDate() - 1); // Default to 1 day
  }
  
  return { start, end };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const mint = event.pathParameters?.mint;
    const range = event.queryStringParameters?.range || "1d";
    
    if (!mint) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "mint parameter is required" }),
      };
    }
    
    const { start, end } = getDateRange(range);
    const points: Array<{ timestamp: number; price: number }> = [];
    
    // Query each day in the range
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split("T")[0].replace(/-/g, "");
      
      const result = await client.send(
        new QueryCommand({
          TableName: Resource.PriceTimeSeriesTable.name,
          KeyConditionExpression: "tokenDate = :tokenDate AND #ts BETWEEN :start AND :end",
          ExpressionAttributeNames: {
            "#ts": "timestamp",
          },
          ExpressionAttributeValues: {
            ":tokenDate": `${mint}#${dateStr}`,
            ":start": Math.floor(start.getTime() / 1000),
            ":end": Math.floor(end.getTime() / 1000),
          },
          ScanIndexForward: true, // Sort ascending by timestamp
        })
      );
      
      if (result.Items) {
        result.Items.forEach(item => {
          points.push({
            timestamp: item.timestamp,
            price: item.price,
          });
        });
      }
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Sample points if there are too many
    const maxPoints = 200;
    let sampledPoints = points;
    
    if (points.length > maxPoints) {
      const interval = Math.floor(points.length / maxPoints);
      sampledPoints = points.filter((_, index) => index % interval === 0);
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: mint,
        range,
        points: sampledPoints,
      }),
    };
    
  } catch (error) {
    console.error("Error getting token prices:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 