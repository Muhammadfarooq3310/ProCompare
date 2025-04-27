import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false }) // Ensures passwords aren't exposed in queries
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ type: 'varchar', length: 255, nullable: true, default: '' })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: '' })
  companyName: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: '' })
  phoneNumber: string;
}
