import { Controller, Get, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('presentations/:code/results')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  presentationResults(@Param('code') code: string) {
    return this.analyticsService.presentationResults(code);
  }

  @Get(':questionId')
  questionResults(
    @Param('code') code: string,
    @Param('questionId') questionId: string,
  ) {
    return this.analyticsService.questionResults(code, questionId);
  }
}
