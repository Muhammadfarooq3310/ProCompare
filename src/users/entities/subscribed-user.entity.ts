// src/users/entities/subscribed-user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum SubscriptionType {
  FREE = 'free',
  SUBSCRIBED = 'subscribed',
}

@Entity('subscribed_users')
export class SubscribedUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({
    type: 'enum',
    enum: SubscriptionType,
    default: SubscriptionType.FREE,
  })
  type: SubscriptionType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subscriptionStatus: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  currentPlan: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  invoiceStatus: string | null;

  @Column({ type: 'timestamp', nullable: true })
  nextInvoiceDate: Date | null;

  @OneToOne(() => User)
  @JoinColumn({ name: 'email', referencedColumnName: 'email' })
  user: User;
}
