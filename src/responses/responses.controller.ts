import { Body, Controller, Param, Post } from '@nestjs/common';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { ResponsesService } from './responses.service';

@Controller('presentations/:code/responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  submit(@Param('code') code: string, @Body() dto: SubmitResponseDto) {
    return this.responsesService.submit(code, dto);
  }
}
