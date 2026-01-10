import { UseGuards } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JwtWsGuard } from '../../common/guards/jwt-ws.guard';

@WebSocketGateway({ cors: true })
@UseGuards(JwtWsGuard)
export class TrackingGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('location')
  handleLocation(@MessageBody() data: any) {
    this.server.emit(`order-${data.orderId}`, data);
  }
}
