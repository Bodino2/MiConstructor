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

  private normalizePlate(plate: string): string {
    return String(plate || '').trim().toUpperCase().replace(/\\s+/g, '');
  }

  async validateBindingOrThrow(plateNumber: string): Promise<{ driverId?: string }> {
    const plate = this.normalizePlate(plateNumber);

    const authUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
    const internalKey = process.env.INTERNAL_KEY;

    if (!internalKey) {
      // Fail closed: dacă INTERNAL_KEY lipsește, refuzăm update-location
      throw new Error('Missing INTERNAL_KEY env var');
    }

    const url = ${authUrl}/internal/binding/validate?plate_number=;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'x-internal-key': internalKey,
      },
    });

    if (!resp.ok) {
      // dacă auth service răspunde 401/500 etc, fail closed
      throw new Error(Binding validation failed with status );
    }

    const data: any = await resp.json();
    if (!data?.allowed) {
      // Not bound => forbidden
      const err: any = new Error('TRUCK_NOT_BOUND');
      err.code = 'TRUCK_NOT_BOUND';
      throw err;
    }

    return { driverId: data.driverId };
  }
}

