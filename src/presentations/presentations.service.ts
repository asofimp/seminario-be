import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { Model } from 'mongoose';
import { Events, PresentationStateChangedEvent } from '../common/events';
import { SurveyDocument } from '../surveys/schemas/survey.schema';
import { SurveysService } from '../surveys/surveys.service';
import { CreatePresentationDto } from './dto/create-presentation.dto';
import { UpdateStateDto } from './dto/update-state.dto';
import {
  AudienceView,
  Presentation,
  PresentationDocument,
  ScreenView,
} from './schemas/presentation.schema';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface PresentationSnapshot {
  presentation: PresentationDocument;
  survey: SurveyDocument;
}

@Injectable()
export class PresentationsService {
  constructor(
    @InjectModel(Presentation.name)
    private readonly presentationModel: Model<Presentation>,
    private readonly surveysService: SurveysService,
    private readonly events: EventEmitter2,
  ) {}

  // Solo una presentación activa a la vez: hay que terminarla para crear otra.
  // El índice único parcial sobre isActive cubre las carreras entre peticiones.
  async create(dto: CreatePresentationDto): Promise<PresentationDocument> {
    const survey = await this.surveysService.findOne(dto.surveyId);
    const active = await this.findActive();
    if (active) throw this.activeConflict(active.code);

    try {
      return await this.presentationModel.create({
        title: dto.title,
        survey: survey._id,
        code: await this.generateUniqueCode(),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const current = await this.findActive();
        throw this.activeConflict(current?.code ?? '?');
      }
      throw err;
    }
  }

  // Las presentaciones creadas antes de existir isActive cuentan como activas
  // hasta que se terminen.
  findActive(): Promise<PresentationDocument | null> {
    return this.presentationModel
      .findOne({ isActive: { $ne: false } })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Cierra la presentación: deja de aceptar votos y libera el cupo de activa.
  async end(code: string): Promise<PresentationDocument> {
    const presentation = await this.findByCode(code);
    if (presentation.isActive === false) return presentation;

    presentation.set({
      isActive: false,
      endedAt: new Date(),
      'state.audienceView': AudienceView.CLOSED,
      'state.screenView': ScreenView.SUMMARY,
      'state.acceptingResponses': false,
    });
    await presentation.save();

    this.events.emit(Events.PRESENTATION_STATE_CHANGED, {
      code: presentation.code,
      state: presentation.state,
    } satisfies PresentationStateChangedEvent);

    return presentation;
  }

  private activeConflict(code: string) {
    return new ConflictException(
      `Ya hay una presentación activa (${code}). Termínala antes de crear otra.`,
    );
  }

  findAll(): Promise<PresentationDocument[]> {
    return this.presentationModel.find().sort({ createdAt: -1 }).exec();
  }

  async findByCode(code: string): Promise<PresentationDocument> {
    const presentation = await this.presentationModel
      .findOne({ code: code.toUpperCase() })
      .exec();
    if (!presentation) {
      throw new NotFoundException(`Presentation ${code} not found`);
    }
    return presentation;
  }

  async getSnapshot(code: string): Promise<PresentationSnapshot> {
    const presentation = await this.findByCode(code);
    const survey = await this.surveysService.findOne(presentation.survey);
    return { presentation, survey };
  }

  async updateState(
    code: string,
    dto: UpdateStateDto,
  ): Promise<PresentationDocument> {
    const { presentation, survey } = await this.getSnapshot(code);
    this.assertActive(presentation);

    if (dto.currentQuestionId && !survey.questions.id(dto.currentQuestionId)) {
      throw new BadRequestException(
        `Question ${dto.currentQuestionId} does not belong to this survey`,
      );
    }

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) presentation.set(`state.${key}`, value);
    }
    await presentation.save();

    this.events.emit(Events.PRESENTATION_STATE_CHANGED, {
      code: presentation.code,
      state: presentation.state,
    } satisfies PresentationStateChangedEvent);

    return presentation;
  }

  // Moves to the adjacent question and opens it for voting on both views.
  async step(code: string, direction: 1 | -1): Promise<PresentationDocument> {
    const { presentation, survey } = await this.getSnapshot(code);
    this.assertActive(presentation);
    const ids = survey.questions.map((q) => q._id.toString());
    if (ids.length === 0) {
      throw new BadRequestException('Survey has no questions');
    }

    const current = ids.indexOf(presentation.state.currentQuestionId ?? '');
    const next = Math.min(Math.max(current + direction, 0), ids.length - 1);

    return this.updateState(code, {
      currentQuestionId: ids[next],
      audienceView: AudienceView.QUESTION,
      screenView: ScreenView.QUESTION,
      acceptingResponses: true,
      showResultsToAudience: false,
    });
  }

  private assertActive(presentation: PresentationDocument) {
    if (presentation.isActive === false) {
      throw new BadRequestException(
        `La presentación ${presentation.code} ya terminó`,
      );
    }
  }

  private async generateUniqueCode(): Promise<string> {
    for (;;) {
      const code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join('');
      if (!(await this.presentationModel.exists({ code }))) {
        return code;
      }
    }
  }
}
