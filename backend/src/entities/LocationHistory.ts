import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Truck } from './Truck';

@Entity('location_history')
export class LocationHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  plateNumber: string;

  @Column({ type: 'decimal', precision: 10, scale: 6 })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 6 })
  longitude: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @ManyToOne(() => Truck, (truck) => truck.locationHistory, { onDelete: 'CASCADE' })
  truck: Truck;
}
