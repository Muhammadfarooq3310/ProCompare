import {
  Controller,
  FileTypeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AwsUploadService } from './aws-upload.service';

@Controller('aws-upload')
export class AwsUploadController {
  constructor(private readonly uploadService: AwsUploadService) {} // Corrected typo here

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({
            fileType:
              /(csv|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    console.log(file);

    // Call the upload service and await the result, which should return the file URL
    const fileUrl = await this.uploadService.upload(
      file.originalname,
      file.buffer,
    );

    return {
      message: 'File uploaded successfully',
      fileUrl: fileUrl, // Returning the uploaded file URL in the response
    };
  }
}
