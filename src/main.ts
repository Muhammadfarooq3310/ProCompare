import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import cookieParser = require('cookie-parser');

import * as express from 'express';
import * as bodyParser from 'body-parser';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser()); // Add this if it's missing
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl === '/stripe/webhook') {
      bodyParser.raw({ type: 'application/json' })(req, res, next);
    } else {
      bodyParser.json()(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: true }));

  // Update the allowedOrigins array to include your actual frontend URL
  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? [
          'https://procompare.vercel.app',
          'http://ec2-44-203-163-136.compute-1.amazonaws.com',
          'http://3.225.207.199',
          'http://3.225.207.199:3000',
          'http://3.225.207.199:80',
          'http://ec2-44-203-163-136.compute-1.amazonaws.com:3000', // Include with port if needed
          'http://ec2-44-203-163-136.compute-1.amazonaws.com:80', // Include standard HTTP port
        ]
      : ['http://localhost:3000', 'http://localhost:5173'];
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('Blocked origin:', origin); // For debugging
        callback(null, false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: 'Content-Type, Authorization',
  });

  await app.listen(3001, '0.0.0.0', () => {
    console.log('Server running on port 3000');
  });
}
bootstrap();
