import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from './analytics/analytics.module';
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
      }),
    }),
    EventEmitterModule.forRoot(),
    SurveysModule,
    PresentationsModule,
    ResponsesModule,
    QaModule,
    AnalyticsModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
