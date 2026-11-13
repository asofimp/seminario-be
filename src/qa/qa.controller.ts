import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ControlKeyGuard } from '../common/guards/control-key.guard';
import { AskQuestionDto } from './dto/ask-question.dto';
import { UpdateAudienceQuestionDto } from './dto/update-audience-question.dto';
import { QaService } from './qa.service';

@Controller('presentations/:code/qa')
export class QaController {
  constructor(private readonly qaService: QaService) {}

  @Post()
  ask(@Param('code') code: string, @Body() dto: AskQuestionDto) {
    return this.qaService.ask(code, dto);
  }

  @Get()
  list(@Param('code') code: string) {
    return this.qaService.list(code);
  }

  @Patch(':id')
  @UseGuards(ControlKeyGuard)
  update(
    @Param('code') code: string,
    @Param('id') id: string,
    @Body() dto: UpdateAudienceQuestionDto,
  ) {
    return this.qaService.setAnswered(code, id, dto.answered);
  }
}
