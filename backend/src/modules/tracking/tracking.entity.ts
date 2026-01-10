import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tracking')
export class TrackingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @Column('decimal', { precision: 10, scale: 6 })
  latitude: number;

  @Column('decimal', { precision: 10, scale: 6 })
  longitude: number;

  @Column({ default: false })
  isFinal: boolean;

  @Column({ nullable: true })
  trackingActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
