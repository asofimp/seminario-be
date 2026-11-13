import mongoose from 'mongoose';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Si MongoDB está desconectado, las consultas fallan a los 8 s en vez de esperar.
mongoose.set('bufferTimeoutMS', 8000);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Para guardar los votos pendientes antes de apagarse (SIGTERM de Render).
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get<string>('corsOrigin') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(config.get<number>('port') ?? 3000);
}
void bootstrap();
