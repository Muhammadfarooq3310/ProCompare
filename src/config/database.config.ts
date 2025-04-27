import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import * as dotenv from 'dotenv';
import { User } from '../users/entities/user.entity';
import { SubscribedUser } from 'src/users/entities/subscribed-user.entity';
import { SubscriptionEvent } from 'src/users/entities/subscription-event.entity';

dotenv.config();

const config: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 20840,
  username: process.env.DB_USERNAME || 'user',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'dbname',
  // ssl: {
  //   rejectUnauthorized: false,
  // },

  // entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  entities: [User, SubscribedUser, SubscriptionEvent], // Register your entity here
  synchronize: true, // ⚠️ Only use this in development!
  logging: true, // Logs SQL queries (optional)
  autoLoadEntities: true,
};

export default config;
