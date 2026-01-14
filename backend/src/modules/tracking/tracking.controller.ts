import { Controller, Post, Body, Get, Param, ForbiddenException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly service: TrackingService) {}

  @Post('update')
  update(@Body() body: { orderId: string; lat: number; lng: number }) {
    return this.service.saveLocation(body.orderId, body.lat, body.lng);
  }

  @Post('update-location')
  async updateLocation(@Body() body: { plate_number: string; lat: number; lng: number }) {
    try {
      await this.service.validateBindingOrThrow(body.plate_number);
    } catch (e: any) {
      if (e?.code === 'TRUCK_NOT_BOUND' || e?.message === 'TRUCK_NOT_BOUND') {
        throw new ForbiddenException('Truck is not bound to a driver');
      }
      // fail closed: orice eroare de validate = refuz
      throw new ForbiddenException('Binding validation failed');
    }

    return this.service.saveLocation(body.plate_number, body.lat, body.lng);
  }

  @Get(':orderId')
  getLast(@Param('orderId') orderId: string) {
    return this.service.getLastLocation(orderId);
  }

  @Get('history/:orderId')
  getHistory(@Param('orderId') orderId: string) {
    return this.service.getHistory(orderId);
  }
}

