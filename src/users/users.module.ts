// src/users/users.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { JwtModule } from '@nestjs/jwt';
import { StripeModule } from 'src/stripe/stripe.module';
import { SubscribedUser } from './entities/subscribed-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SubscribedUser]),
    JwtModule.register({
      // You can move these options to your configuration
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
    forwardRef(() => StripeModule), // Use forwardRef to resolve the circular dependency
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
