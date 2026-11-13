import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { PresentationsModule } from './presentations/presentations.module';
import { QaModule } from './qa/qa.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ResponsesModule } from './responses/responses.module';
import { SurveysModule } from './surveys/surveys.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('mongodb.uri'),
        dbName: config.get<string>('mongodb.dbName'),
        user: config.get<string>('mongodb.username'),
        pass: config.get<string>('mongodb.password'),
        // Diagnóstico: caídas y reconexiones con MongoDB.
        connectionFactory: (connection: Connection) => {
          const logger = new Logger('MongoDB');
          connection.on('disconnected', () => logger.warn('desconectado'));
          connection.on('reconnected', () => logger.log('reconectado'));
          connection.on('error', (err: Error) =>
            logger.error(`error: ${err.message}`),
          );
          return connection;
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    SurveysModule,
    PresentationsModule,
    ResponsesModule,
    QaModule,
    AuthModule,
    AnalyticsModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
