import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { ControlKeyGuard } from '../common/guards/control-key.guard';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SurveysService } from './surveys.service';

@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Post()
  @UseGuards(AdminKeyGuard)
  create(@Body() dto: CreateSurveyDto) {
    return this.surveysService.create(dto);
  }

  @Get()
  @UseGuards(ControlKeyGuard)
  findAll() {
    return this.surveysService.findAll();
  }

  @Get(':id')
  @UseGuards(ControlKeyGuard)
  findOne(@Param('id') id: string) {
    return this.surveysService.findOne(id);
  }

  @Put(':id')
  @UseGuards(AdminKeyGuard)
  replace(@Param('id') id: string, @Body() dto: CreateSurveyDto) {
    return this.surveysService.replace(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminKeyGuard)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.surveysService.remove(id);
  }
}
