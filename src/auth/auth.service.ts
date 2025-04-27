// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    console.log(`🔍 Checking user for email: ${email}`);

    const user = await this.usersService.findOne(email, true);

    if (!user) {
      console.error(`❌ User not found for email: ${email}`);
      return null;
    }

    if (!user.password) {
      console.error(`❌ User password is missing for email: ${email}`);
      return null;
    }

    console.log(`🔑 Stored password hash for ${email}: ${user.password}`);
    console.log(`🔑 Comparing with provided password: ${password}`);

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.error(`❌ Password mismatch for email: ${email}`);
      return null;
    }

    console.log(`✅ Login successful for: ${email}`);
    const { password: _, ...result } = user;
    console.log(_);
    return result;
  }

  login(user: Omit<User, 'password'>) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    console.log('login');
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async register(email: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      throw new UnauthorizedException('Passwords do not match');
    }

    const user = await this.usersService.create(email, password);
    return this.login(user);
  }

  async registerAdmin(
    email: string,
    password: string,
    confirmPassword: string,
  ) {
    if (password !== confirmPassword) {
      throw new UnauthorizedException('Passwords do not match');
    }

    const user = await this.usersService.create(
      email,
      password,
      UserRole.ADMIN,
    );
    return this.login(user);
  }
}
