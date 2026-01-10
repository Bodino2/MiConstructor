import { DataSource } from 'typeorm';
import { User } from './entities/User';
import { Truck } from './entities/Truck';
import { LocationHistory } from './entities/LocationHistory';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'secret_password',
  database: process.env.DB_NAME || 'freight_platform',
  synchronize: true,
  logging: false,
  entities: [User, Truck, LocationHistory],
});
