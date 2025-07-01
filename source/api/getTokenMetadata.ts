import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
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
    
    // Get token metadata from DynamoDB
    const result = await client.send(
      new GetCommand({
        TableName: Resource.TokensTable.name,
        Key: { token: mint },
      })
    );
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Token not found" }),
      };
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: result.Item.token,
        symbol: result.Item.symbol,
        name: result.Item.name,
        decimals: result.Item.decimals,
        imageUrl: result.Item.imageUrl,
        description: result.Item.description,
        phase: result.Item.phase,
        ammPool: result.Item.ammPool,
        createdAt: result.Item.createdAt,
        transitionedAt: result.Item.transitionedAt,
      }),
    };
    
  } catch (error) {
    console.error("Error getting token metadata:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 