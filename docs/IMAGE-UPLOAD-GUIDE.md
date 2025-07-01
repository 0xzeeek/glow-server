# Image Upload Guide

This guide explains how to upload user profile images and token images from your React Native app.

## Overview

The backend uses S3 presigned URLs for secure image uploads. This approach:
- Allows direct uploads from mobile apps to S3
- Keeps your AWS credentials secure
- Provides temporary upload URLs that expire
- Supports large file uploads without going through Lambda

## Upload Flow

1. **Get presigned URL** - Call the API to get a temporary upload URL
2. **Upload image** - Use the URL to upload directly to S3
3. **Update metadata** - Save the public URL in DynamoDB

## React Native Implementation

### 1. Image Upload Service

```typescript
// src/services/ImageUploadService.ts
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const API_URL = 'https://your-api.execute-api.us-east-1.amazonaws.com';

export interface UploadResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

export class ImageUploadService {
  /**
   * Compress and convert image to WebP format
   */
  static async prepareImage(uri: string, maxWidth: number = 800): Promise<string> {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: 0.8, format: SaveFormat.WEBP }
    );
    return result.uri;
  }

  /**
   * Get presigned URL for token image upload
   */
  static async getTokenImageUploadUrl(mint: string): Promise<UploadResponse> {
    const response = await fetch(`${API_URL}/tokens/${mint}/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get upload URL');
    }

    return response.json();
  }

  /**
   * Get presigned URL for user profile image upload
   */
  static async getUserImageUploadUrl(wallet: string): Promise<UploadResponse> {
    const response = await fetch(`${API_URL}/users/${wallet}/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get upload URL');
    }

    return response.json();
  }

  /**
   * Upload image to S3 using presigned URL
   */
  static async uploadToS3(uploadUrl: string, imageUri: string): Promise<void> {
    // Read the image file
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Upload to S3
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'image/webp',
      },
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload image to S3');
    }
  }

  /**
   * Complete workflow: prepare, get URL, upload
   */
  static async uploadTokenImage(mint: string, imageUri: string): Promise<string> {
    try {
      // 1. Prepare image (compress and convert to WebP)
      const preparedUri = await this.prepareImage(imageUri);

      // 2. Get presigned upload URL
      const { uploadUrl, publicUrl } = await this.getTokenImageUploadUrl(mint);

      // 3. Upload to S3
      await this.uploadToS3(uploadUrl, preparedUri);

      // 4. Update token metadata with new image URL
      await this.updateTokenMetadata(mint, { imageUrl: publicUrl });

      return publicUrl;
    } catch (error) {
      console.error('Token image upload failed:', error);
      throw error;
    }
  }

  /**
   * Upload user profile image
   */
  static async uploadUserImage(wallet: string, imageUri: string): Promise<string> {
    try {
      // 1. Prepare image
      const preparedUri = await this.prepareImage(imageUri, 400); // Smaller for profiles

      // 2. Get presigned upload URL
      const { uploadUrl, publicUrl } = await this.getUserImageUploadUrl(wallet);

      // 3. Upload to S3
      await this.uploadToS3(uploadUrl, preparedUri);

      // 4. Update user profile with new image URL
      await this.updateUserProfile(wallet, { profileUrl: publicUrl });

      return publicUrl;
    } catch (error) {
      console.error('User image upload failed:', error);
      throw error;
    }
  }

  /**
   * Update token metadata
   */
  private static async updateTokenMetadata(
    mint: string, 
    updates: { imageUrl: string }
  ): Promise<void> {
    const response = await fetch(`${API_URL}/tokens/${mint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error('Failed to update token metadata');
    }
  }

  /**
   * Update user profile
   */
  private static async updateUserProfile(
    wallet: string, 
    updates: { profileUrl: string }
  ): Promise<void> {
    const response = await fetch(`${API_URL}/users/${wallet}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error('Failed to update user profile');
    }
  }
}
```

### 2. Image Picker Component

```typescript
// src/components/ImageUploader.tsx
import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  Text,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageUploadService } from '../services/ImageUploadService';

interface Props {
  type: 'token' | 'user';
  identifier: string; // mint address or wallet address
  currentImageUrl?: string;
  onUploadComplete?: (url: string) => void;
}

export const ImageUploader: React.FC<Props> = ({
  type,
  identifier,
  currentImageUrl,
  onUploadComplete,
}) => {
  const [imageUri, setImageUri] = useState<string | null>(currentImageUrl || null);
  const [isUploading, setIsUploading] = useState(false);

  const pickImage = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant camera roll permissions to upload images.'
      );
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'user' ? [1, 1] : [16, 9],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    setIsUploading(true);
    
    try {
      let publicUrl: string;
      
      if (type === 'token') {
        publicUrl = await ImageUploadService.uploadTokenImage(identifier, uri);
      } else {
        publicUrl = await ImageUploadService.uploadUserImage(identifier, uri);
      }
      
      onUploadComplete?.(publicUrl);
      
      Alert.alert('Success', 'Image uploaded successfully!');
    } catch (error) {
      console.error('Upload failed:', error);
      Alert.alert('Upload Failed', 'Please try again later.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={pickImage}
      disabled={isUploading}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {type === 'token' ? 'Upload Token Image' : 'Upload Profile Picture'}
          </Text>
        </View>
      )}
      
      {isUploading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: '#666',
    fontSize: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
```

### 3. Using the Components

```typescript
// Example: Token details screen
export const TokenDetailsScreen: React.FC = () => {
  const { mint } = useParams();
  const [tokenData, setTokenData] = useState<TokenMetadata | null>(null);

  return (
    <ScrollView>
      {/* Token image uploader (admin only) */}
      {isAdmin && (
        <ImageUploader
          type="token"
          identifier={mint}
          currentImageUrl={tokenData?.imageUrl}
          onUploadComplete={(url) => {
            setTokenData(prev => prev ? { ...prev, imageUrl: url } : null);
          }}
        />
      )}
      
      {/* Display token info */}
      <Text>{tokenData?.name}</Text>
      <Text>{tokenData?.symbol}</Text>
    </ScrollView>
  );
};

// Example: User profile screen
export const UserProfileScreen: React.FC = () => {
  const { wallet } = useWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  return (
    <View>
      {/* Profile picture uploader */}
      <ImageUploader
        type="user"
        identifier={wallet.publicKey.toString()}
        currentImageUrl={profile?.profileUrl}
        onUploadComplete={(url) => {
          setProfile(prev => prev ? { ...prev, profileUrl: url } : null);
        }}
      />
      
      {/* Display user info */}
      <Text>Wallet: {wallet.publicKey.toString()}</Text>
    </View>
  );
};
```

## Backend Implementation Details

### S3 Bucket Configuration

The buckets are created with default settings in SST. For production, you may want to:

1. **Enable public read access** for images:
```typescript
// In sst.config.ts
const tokenMetadataBucket = new sst.aws.Bucket("TokenMetadataBucket", {
  public: true, // Allow public read access
});
```

2. **Add CORS configuration** for browser uploads:
```typescript
const tokenMetadataBucket = new sst.aws.Bucket("TokenMetadataBucket", {
  cors: [
    {
      allowedHeaders: ["*"],
      allowedMethods: ["GET", "PUT", "POST"],
      allowedOrigins: ["*"],
      maxAge: "3000",
    },
  ],
});
```

3. **Set up lifecycle rules** to manage old images:
```typescript
const tokenMetadataBucket = new sst.aws.Bucket("TokenMetadataBucket", {
  lifecycle: [
    {
      id: "delete-old-images",
      enabled: true,
      prefix: "tokens/",
      expiration: {
        days: 365, // Delete images after 1 year
      },
    },
  ],
});
```

### Image Processing Options

For advanced image processing, consider:

1. **Lambda@Edge** for on-the-fly resizing
2. **CloudFront** for global CDN distribution
3. **AWS Rekognition** for content moderation

## Security Considerations

1. **File Size Limits**: Add size validation in the presigned URL:
```typescript
const command = new PutObjectCommand({
  Bucket: Resource.TokenMetadataBucket.name,
  Key: key,
  ContentType: "image/webp",
  ContentLength: 5 * 1024 * 1024, // 5MB max
});
```

2. **File Type Validation**: Only allow specific image types
3. **Rate Limiting**: Limit upload requests per user
4. **Access Control**: Ensure only authorized users can upload

## Cost Optimization

1. **Use WebP format** - Smaller file sizes, better quality
2. **Implement image compression** before upload
3. **Set up S3 Intelligent-Tiering** for automatic cost optimization
4. **Use CloudFront** for frequently accessed images

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure S3 bucket has proper CORS configuration
2. **Upload fails**: Check presigned URL expiration (1 hour default)
3. **Image not displaying**: Verify bucket public access settings
4. **Large files timeout**: Implement multipart upload for files > 5MB

### Debug Tips

```typescript
// Log presigned URL details (remove in production)
console.log('Upload URL:', uploadUrl);
console.log('Expires in:', expiresIn, 'seconds');

// Test S3 connectivity
try {
  const response = await fetch(publicUrl, { method: 'HEAD' });
  console.log('Image accessible:', response.ok);
} catch (error) {
  console.error('Image not accessible:', error);
}
```

## Next Steps

1. Add image optimization Lambda function
2. Implement CloudFront CDN for global distribution
3. Add image moderation with AWS Rekognition
4. Set up automated backups
5. Monitor S3 costs with AWS Cost Explorer 