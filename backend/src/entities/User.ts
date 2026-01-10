import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Truck } from './Truck';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: ['admin', 'driver', 'dispatcher'], default: 'driver' })
  role: 'admin' | 'driver' | 'dispatcher';

  @OneToMany(() => Truck, (truck) => truck.driver)
  trucks: Truck[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
