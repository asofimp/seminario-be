import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PresentationsModule } from '../presentations/presentations.module';
import { ResponsesModule } from '../responses/responses.module';
import { LiveGateway } from './live.gateway';

@Module({
  imports: [PresentationsModule, ResponsesModule, AnalyticsModule],
  providers: [LiveGateway],
})
export class RealtimeModule {}
