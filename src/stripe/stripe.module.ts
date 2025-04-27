// src/stripe/stripe.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { SubscriptionEvent } from '../users/entities/subscription-event.entity';
// import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { SubscribedUser } from '../users/entities/subscribed-user.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, SubscribedUser, SubscriptionEvent]),
    // UsersModule,
  ],
  providers: [StripeService],
  controllers: [StripeController],
  exports: [StripeService],
})
export class StripeModule {}
