import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { z } from "zod";

const client = new DynamoDBClient({});

// Schema for update request
const UpdateTokenSchema = z.object({
  name: z.string().optional(),
  imageUrl: z.string().url().optional(),
  description: z.string().optional(),
  phase: z.enum(["bonding", "amm"]).optional(),
});

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
    
    // Parse and validate request body
    const body = JSON.parse(event.body || "{}");
    const updates = UpdateTokenSchema.parse(body);
    
    // Build update expression
    const updateParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        updateParts.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    });
    
    if (updateParts.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No fields to update" }),
      };
    }
    
    // Add transitionedAt if phase is being updated
    if (updates.phase) {
      updateParts.push("#transitionedAt = :transitionedAt");
      expressionAttributeNames["#transitionedAt"] = "transitionedAt";
      expressionAttributeValues[":transitionedAt"] = Math.floor(Date.now() / 1000);
    }
    
    // Update token metadata
    await client.send(
      new UpdateCommand({
        TableName: Resource.TokensTable.name,
        Key: { token: mint },
        UpdateExpression: `SET ${updateParts.join(", ")}`,
        ExpressionAttributeNames: {
          ...expressionAttributeNames,
          "#token": "token",
        },
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: "attribute_exists(#token)",
      })
    );
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: true,
        updatedAt: Math.floor(Date.now() / 1000),
      }),
    };
    
  } catch (error) {
    console.error("Error updating token metadata:", error);
    
    if (error instanceof z.ZodError) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: "Invalid request", 
          details: error.errors 
        }),
      };
    }
    
    // Check if token doesn't exist
    if ((error as any)?.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Token not found" }),
      };
    }
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 