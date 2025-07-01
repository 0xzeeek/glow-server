import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});

export const handler: Handler = async () => {
  const now = Math.floor(Date.now() / 1000);
  
  console.log("Starting TTL sweeper job");
  
  // Tables to sweep
  const tablesToSweep = [
    { name: Resource.PriceConnectionsTable.name, description: "Price connections" },
    { name: Resource.BalanceConnectionsTable.name, description: "Balance connections" },
    { name: Resource.WebsocketNonceTable.name, description: "WebSocket nonces" },
  ];
  
  for (const table of tablesToSweep) {
    try {
      console.log(`Sweeping ${table.description}...`);
      
      let lastEvaluatedKey;
      let deletedCount = 0;
      
      do {
        // Scan for expired items
        const scanResult = await client.send(
          new ScanCommand({
            TableName: table.name,
            FilterExpression: "ttl < :now AND attribute_exists(ttl)",
            ExpressionAttributeValues: {
              ":now": now,
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );
        
        if (scanResult.Items && scanResult.Items.length > 0) {
          // Delete expired items
          for (const item of scanResult.Items) {
            try {
              const key: any = {};
              
              // Determine the key based on table
              if (table.name.includes("PriceConnections") || table.name.includes("BalanceConnections")) {
                key.connectionId = item.connectionId;
              } else if (table.name.includes("WebsocketNonce")) {
                key.wallet = item.wallet;
              }
              
              await client.send(
                new DeleteCommand({
                  TableName: table.name,
                  Key: key,
                })
              );
              
              deletedCount++;
            } catch (deleteError) {
              console.error(`Error deleting item from ${table.name}:`, deleteError);
            }
          }
        }
        
        lastEvaluatedKey = scanResult.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      console.log(`Deleted ${deletedCount} expired items from ${table.description}`);
      
    } catch (error) {
      console.error(`Error sweeping ${table.description}:`, error);
    }
  }
  
  console.log("TTL sweeper job completed");
}; 