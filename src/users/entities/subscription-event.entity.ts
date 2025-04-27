// src/stripe/entities/subscription-event.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('subscription_events')
export class SubscriptionEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  eventId: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'json' })
  eventPayload: Record<string, any>;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
