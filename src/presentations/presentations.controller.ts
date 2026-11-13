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
import { CreatePresentationDto } from './dto/create-presentation.dto';
import { UpdateStateDto } from './dto/update-state.dto';
import { PresentationsService } from './presentations.service';

@Controller('presentations')
export class PresentationsController {
  constructor(private readonly presentationsService: PresentationsService) {}

  @Post()
  @UseGuards(ControlKeyGuard)
  create(@Body() dto: CreatePresentationDto) {
    return this.presentationsService.create(dto);
  }

  @Get()
  @UseGuards(ControlKeyGuard)
  findAll() {
    return this.presentationsService.findAll();
  }

  // Pública: la pantalla inicial la usa para saber a qué sala unirse.
  @Get('active')
  async findActive() {
    const active = await this.presentationsService.findActive();
    return {
      presentation: active ? { code: active.code, title: active.title } : null,
    };
  }

  // Público y ligero: lo usan los clientes para comprobar que siguen al día.
  @Get(':code/state')
  getState(@Param('code') code: string) {
    return this.presentationsService.getState(code);
  }

  @Get(':code')
  getSnapshot(@Param('code') code: string) {
    return this.presentationsService.getSnapshot(code);
  }

  @Patch(':code/state')
  @UseGuards(ControlKeyGuard)
  updateState(@Param('code') code: string, @Body() dto: UpdateStateDto) {
    return this.presentationsService.updateState(code, dto);
  }

  @Post(':code/next')
  @UseGuards(ControlKeyGuard)
  next(@Param('code') code: string) {
    return this.presentationsService.step(code, 1);
  }

  @Post(':code/end')
  @UseGuards(ControlKeyGuard)
  end(@Param('code') code: string) {
    return this.presentationsService.end(code);
  }

  @Post(':code/prev')
  @UseGuards(ControlKeyGuard)
  prev(@Param('code') code: string) {
    return this.presentationsService.step(code, -1);
  }
}
