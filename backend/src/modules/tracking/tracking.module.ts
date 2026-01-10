import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingEntity } from './tracking.entity';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { TrackingGateway } from './tracking.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([TrackingEntity])],
  providers: [TrackingService, TrackingGateway],
  controllers: [TrackingController],
})
export class TrackingModule {}
