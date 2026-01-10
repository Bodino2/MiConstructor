import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackingEntity } from './tracking.entity';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(TrackingEntity)
    private readonly repo: Repository<TrackingEntity>,
  ) {}

  async saveLocation(orderId: string, lat: number, lng: number) {
    return this.repo.save({ orderId, latitude: lat, longitude: lng });
  }

  async getLastLocation(orderId: string) {
    return this.repo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  async getHistory(orderId: string) {
    return this.repo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  async markFinal(orderId: string) {
    return this.repo.update({ orderId }, { isFinal: true, trackingActive: false });
  }
}
