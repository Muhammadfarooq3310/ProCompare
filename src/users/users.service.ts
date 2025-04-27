// src/users/users.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private stripeService: StripeService,
  ) {}

  async findOne(email: string, withPassword = false): Promise<User | null> {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email });

    if (withPassword) {
      query.addSelect('user.password'); // ✅ Explicitly select password only when needed
    }

    return query.getOne();
  }

  async create(
    email: string,
    password: string,
    role: UserRole = UserRole.USER,
  ): Promise<User> {
    const existingUser = await this.findOne(email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const stripeCustomer = await this.stripeService.createCustomer(email);

    const user = this.usersRepository.create({
      email,
      password: hashedPassword,
      role,
      stripeCustomerId: stripeCustomer.id,
    });

    return this.usersRepository.save(user);
  }
  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
    });
  }

  async update(
    id: number,
    updateData: Partial<Omit<User, 'password' | 'id'>>, // 'id' and 'password' omitted
  ): Promise<User> {
    // Find the user first to verify they exist
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If updating email, check for conflicts
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.findOne(updateData.email);
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }
    }

    // Update user with the provided data (excluding id & password)
    Object.assign(user, updateData);

    return this.usersRepository.save(user);
  }
}
