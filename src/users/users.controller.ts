import {
  Controller,
  Get,
  Post,
  Put, // Add Put for update
  Body,
  Param,
  UseGuards,
  NotFoundException,
  UnauthorizedException,
  Req, // Add this import for the request decorator
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';

import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request as ExpressRequest } from 'express';

// Create an extended interface for your request with user
interface RequestWithUser extends ExpressRequest {
  user: {
    id: number;
    email: string;
    role: UserRole;
  };
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService, // Add this line
  ) {}

  // Only admins can access user list
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  async findAll(): Promise<User[]> {
    // Remove password field from response
    const users = await this.usersRepository.find();
    return users.map((user) => {
      const { password, ...result } = user;
      console.log(password);
      return result as User;
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('updateuser/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() updateData: Partial<User>,
    @Req() req: RequestWithUser,
  ) {
    console.log('🔍 User from JWT:', req.user);

    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      throw new BadRequestException('🔴 Invalid user ID');
    }

    // Now TypeScript knows about req.user properties
    if (req.user.role !== UserRole.ADMIN && req.user.id !== userId) {
      throw new UnauthorizedException(
        '🔴 You are not allowed to update this user',
      );
    }
    console.log('User data from token:', JSON.stringify(req.user));
    // console.log('Request user ID:', req.user.id || req.user.userId);
    console.log('Param user ID:', userId);
    // Proceed with update
    await this.usersRepository.update(userId, updateData);
    return { message: '✅ User updated successfully' };
  }

  @Get(':email')
  async findOne(@Param('email') email: string) {
    const user = await this.usersService.findOne(email);
    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    // Remove password from response
    const { password, ...result } = user;
    console.log(password);
    return result;
  }
  @Get('id/:id') // Change the route to 'users/id/:id' to avoid conflicts
  async findById(@Param('id') id: string) {
    // Keep it as a string
    const numericId = parseInt(id, 10); // Convert to number
    if (isNaN(numericId)) {
      throw new NotFoundException(`Invalid user ID: ${id}`);
    }

    const user = await this.usersService.findById(numericId);
    console.log(user);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Remove password from response
    const { password, role, ...result } = user;
    console.log(password);
    console.log(role);
    return result;
  }

  // Create a regular user
  @Post()
  async create(@Body() createUserDto: { email: string; password: string }) {
    const user = await this.usersService.create(
      createUserDto.email,
      createUserDto.password,
      UserRole.USER,
    );

    // Remove password from response
    const { password, ...result } = user;
    console.log(password);

    return result;
  }

  // Only admins can create other admins
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin')
  async createAdmin(
    @Body() createUserDto: { email: string; password: string },
  ) {
    const user = await this.usersService.create(
      createUserDto.email,
      createUserDto.password,
      UserRole.ADMIN,
    );

    // Remove password from response
    const { password, ...result } = user;
    console.log(password);

    return result;
  }
}
