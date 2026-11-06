import { Module } from '@nestjs/common';
import { PresentationsModule } from '../presentations/presentations.module';
import { ResponsesModule } from '../responses/responses.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [ResponsesModule, PresentationsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
