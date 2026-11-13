import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ADMIN_KEY_HEADER } from './admin-key.guard';
import { resolveControlKey } from './control-access';

// Acciones de control de la presentación (cambiar diapositiva, votación,
// preguntas, terminar): las permite la clave de admin o la de un presentador.
@Injectable()
export class ControlKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!resolveControlKey(this.config, request.header(ADMIN_KEY_HEADER))) {
      throw new UnauthorizedException('Invalid key');
    }
    return true;
  }
}
