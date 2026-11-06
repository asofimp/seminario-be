import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import { UpdateStateDto } from './dto/update-state.dto';
import { PresentationsService } from './presentations.service';

@Controller('presentations')
export class PresentationsController {
  constructor(private readonly presentationsService: PresentationsService) {}

  @Post()
  @UseGuards(AdminKeyGuard)
  create(@Body() dto: CreatePresentationDto) {
    return this.presentationsService.create(dto);
  }

  @Get()
  @UseGuards(AdminKeyGuard)
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

  @Get(':code')
  getSnapshot(@Param('code') code: string) {
    return this.presentationsService.getSnapshot(code);
  }

  @Patch(':code/state')
  @UseGuards(AdminKeyGuard)
  updateState(@Param('code') code: string, @Body() dto: UpdateStateDto) {
    return this.presentationsService.updateState(code, dto);
  }

  @Post(':code/next')
  @UseGuards(AdminKeyGuard)
  next(@Param('code') code: string) {
    return this.presentationsService.step(code, 1);
  }

  @Post(':code/end')
  @UseGuards(AdminKeyGuard)
  end(@Param('code') code: string) {
    return this.presentationsService.end(code);
  }

  @Post(':code/prev')
  @UseGuards(AdminKeyGuard)
  prev(@Param('code') code: string) {
    return this.presentationsService.step(code, -1);
  }
}
