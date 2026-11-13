import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PresentationsModule } from '../presentations/presentations.module';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import {
  AudienceQuestion,
  AudienceQuestionSchema,
} from './schemas/audience-question.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AudienceQuestion.name, schema: AudienceQuestionSchema },
    ]),
    PresentationsModule,
  ],
  controllers: [QaController],
  providers: [QaService],
  exports: [QaService],
})
export class QaModule {}
