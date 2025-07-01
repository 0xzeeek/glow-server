import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Resource } from "sst";

const s3Client = new S3Client({});

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
    
    // Generate unique key for the image
    const timestamp = Date.now();
    const key = `tokens/${mint}/image-${timestamp}.webp`;
    
    // Create presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: Resource.TokenMetadataBucket.name,
      Key: key,
      ContentType: "image/webp",
    });
    
    const uploadUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600 // 1 hour
    });
    
    // The public URL that will be used after upload
    const publicUrl = `https://${Resource.TokenMetadataBucket.name}.s3.amazonaws.com/${key}`;
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        uploadUrl,
        publicUrl,
        key,
        expiresIn: 3600,
      }),
    };
    
  } catch (error) {
    console.error("Error generating upload URL:", error);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}; 