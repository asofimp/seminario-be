import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PresentationsModule } from '../presentations/presentations.module';
import { ResponsesController } from './responses.controller';
import { ResponsesService } from './responses.service';
import { Response, ResponseSchema } from './schemas/response.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Response.name, schema: ResponseSchema },
    ]),
    PresentationsModule,
  ],
  controllers: [ResponsesController],
  providers: [ResponsesService],
  exports: [ResponsesService, MongooseModule],
})
export class ResponsesModule {}
