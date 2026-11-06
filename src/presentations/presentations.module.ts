import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SurveysModule } from '../surveys/surveys.module';
import { PresentationsController } from './presentations.controller';
import { PresentationsService } from './presentations.service';
import {
  Presentation,
  PresentationSchema,
} from './schemas/presentation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Presentation.name, schema: PresentationSchema },
    ]),
    SurveysModule,
  ],
  controllers: [PresentationsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
