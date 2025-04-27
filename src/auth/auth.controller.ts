// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

interface RequestWithUser extends Request {
  user: {
    id: number;
    email: string;
    role: UserRole;
    name: string;
    companyName: string;
    phoneNumber: string;
    stripeCustomerId: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: RequestWithUser, @Res() res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    console.log('-----------');

    const { access_token, user } = this.authService.login(req.user);

    // Set cookie (keep this for browsers that handle cookies properly)
    res.cookie('token', access_token, {
      httpOnly: true, // Change to false to make it accessible by JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Try 'lax' instead of 'strict'
      path: '/', // Ensure the path is set
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    });

    // Also include the token in the response body
    return res.status(200).json({ user, access_token });
  }

  @Post('register')
  async register(
    @Body() body: { email: string; password: string; confirmPassword: string },
  ) {
    console.log('here');
    return this.authService.register(
      body.email,
      body.password,
      body.confirmPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: RequestWithUser) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  getAdminData() {
    return { message: 'Admin data' };
  }
}
