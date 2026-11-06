import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

export const ADMIN_KEY_HEADER = 'x-admin-key';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.header(ADMIN_KEY_HEADER) !== this.config.get('adminApiKey')) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}
