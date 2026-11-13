import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNotEmpty, IsString } from 'class-validator';
import { resolveControlKey } from '../common/guards/control-access';

class RemoteLoginDto {
  @IsString()
  @IsNotEmpty()
  key: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  // Control remoto: dice si la clave es de admin o de qué fase es el presentador.
  @Post('remote')
  @HttpCode(200)
  remote(@Body() dto: RemoteLoginDto) {
    const access = resolveControlKey(this.config, dto.key);
    if (!access) throw new UnauthorizedException('Clave incorrecta');
    return access;
  }
}
