import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { User } from './User';
import { LocationHistory } from './LocationHistory';

@Entity('trucks')
export class Truck {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  plateNumber: string;

  @Column()
  model: string;

  @Column({ nullable: true })
  capacity: number;

  @ManyToOne(() => User, (user) => user.trucks, { onDelete: 'SET NULL' })
  driver: User;

  @OneToMany(() => LocationHistory, (location) => location.truck)
  locationHistory: LocationHistory[];

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  longitude: number;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt: Date;

  @Column({ default: true })
  isActive: boolean;
}
