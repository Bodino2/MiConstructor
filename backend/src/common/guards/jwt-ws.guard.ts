import { CanActivate, ExecutionContext } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export class JwtWsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client: any = context.switchToWs().getClient();
    const token = client?.handshake?.auth?.token;
    if (!token) return false;

    try {
      client.user = jwt.verify(token, process.env.JWT_SECRET as jwt.Secret);
      return true;
    } catch {
      return false;
    }
  }
}
