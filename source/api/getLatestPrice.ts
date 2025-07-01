import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const mint = event.pathParameters?.mint;
    
    if (!mint) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "mint parameter is required" }),
      };
    }
    
    // Get today's date for the partition key
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, "");
    
    // Query the most recent price
    const result = await client.send(
      new QueryCommand({
        TableName: Resource.PriceTimeSeriesTable.name,
        KeyConditionExpression: "tokenDate = :tokenDate",
        ExpressionAttributeValues: {
          ":tokenDate": `${mint}#${dateStr}`,
        },
        ScanIndexForward: false, // Sort descending by timestamp
        Limit: 1,
      })
    );
    
    if (!result.Items || result.Items.length === 0) {
      // Try yesterday if no data today
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0].replace(/-/g, "");
      
      const yesterdayResult = await client.send(
        new QueryCommand({
          TableName: Resource.PriceTimeSeriesTable.name,
          KeyConditionExpression: "tokenDate = :tokenDate",
          ExpressionAttributeValues: {
            ":tokenDate": `${mint}#${yesterdayStr}`,
          },
          ScanIndexForward: false,
          Limit: 1,
        })
      );
      
      if (!yesterdayResult.Items || yesterdayResult.Items.length === 0) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "No price data found for token" }),
        };
      }
      
      const item = yesterdayResult.Items[0];
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: mint,
          price: item.price,
          source: item.source,
          timestamp: item.timestamp,
        }),
      };
    }
    
    const item = result.Items[0];
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: mint,
        price: item.price,
        source: item.source,
        timestamp: item.timestamp,
      }),
    };
    
  } catch (error) {
    console.error("Error getting latest price:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 