import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PresentationsModule } from '../presentations/presentations.module';
import { QaModule } from '../qa/qa.module';
import { ResponsesModule } from '../responses/responses.module';
import { LiveGateway } from './live.gateway';

@Module({
  imports: [PresentationsModule, ResponsesModule, AnalyticsModule, QaModule],
  providers: [LiveGateway],
})
export class RealtimeModule {}
