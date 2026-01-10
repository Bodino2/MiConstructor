import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly service: TrackingService) {}

  @Post('update')
  update(@Body() body: { orderId: string; lat: number; lng: number }) {
    return this.service.saveLocation(body.orderId, body.lat, body.lng);
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
