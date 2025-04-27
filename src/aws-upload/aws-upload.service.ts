import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AwsUploadService {
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_S3_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing AWS configuration');
    }

    this.s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }

  async upload(fileName: string, file: Buffer): Promise<string> {
    // Upload the file to the S3 bucket
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: 'procompare', // Your bucket name
        Key: fileName, // The file name to save the file as
        Body: file, // The file buffer
      }),
    );

    // Generate the public URL of the uploaded file (assuming the bucket is public or publicly accessible)
    const fileUrl = `https://procompare.s3.amazonaws.com/${fileName}`;

    // Return the URL
    return fileUrl;
  }
}
