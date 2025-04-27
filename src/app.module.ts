import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import config from './config/database.config';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module'; // ✅ Import UsersModule
import { StripeModule } from './stripe/stripe.module';
import { ScraperModule } from './scraper/scraper.module';
import { AwsUploadModule } from './aws-upload/aws-upload.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(config),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    StripeModule,
    ScraperModule,
    UsersModule,
    AuthModule,
    AwsUploadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
