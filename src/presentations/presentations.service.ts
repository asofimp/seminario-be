import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { Model } from 'mongoose';
import { withTimeout } from '../common/with-timeout';
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
export class PresentationsService implements OnModuleInit {
  constructor(
    @InjectModel(Presentation.name)
    private readonly presentationModel: Model<Presentation>,
    private readonly surveysService: SurveysService,
    private readonly events: EventEmitter2,
  ) {}

  // Solo una presentación activa a la vez: hay que terminarla para crear otra.
  // El índice único parcial sobre isActive cubre las carreras entre peticiones.
  // El índice viejo (una activa en total) bloquearía las prácticas: se quita.
  async onModuleInit() {
    try {
      await this.presentationModel.collection.dropIndex('isActive_1');
    } catch {
      // ya no existe
    }
    await this.presentationModel.createIndexes();
  }

  async create(dto: CreatePresentationDto): Promise<PresentationDocument> {
    const survey = await this.surveysService.findOne(dto.surveyId);
    const practice = dto.practice === true;
    if (!practice) {
      const active = await this.findActive();
      if (active) throw this.activeConflict(active.code);
    }

    try {
      const created = await this.presentationModel.create({
        title: dto.title,
        survey: survey._id,
        code: await this.generateUniqueCode(),
        practice,
      });
      this.remember(created);
      return created;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const current = await this.findActive();
        throw this.activeConflict(current?.code ?? '?');
      }
      throw err;
    }
  }

  // Presentación principal activa (las prácticas no cuentan). Las creadas antes
  // de existir isActive cuentan como activas hasta que se terminen.
  private activeCache?: {
    at: number;
    value: Promise<PresentationDocument | null>;
  };

  findActive(): Promise<PresentationDocument | null> {
    if (this.activeCache && Date.now() - this.activeCache.at < 3000) {
      return this.activeCache.value;
    }
    const value = withTimeout(
      this.presentationModel
        .findOne({ isActive: { $ne: false }, practice: { $ne: true } })
        .sort({ createdAt: -1 })
        .exec(),
      'presentación activa',
    );
    value.catch(() => (this.activeCache = undefined));
    this.activeCache = { at: Date.now(), value };
    return value;
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

    this.remember(presentation);
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

  // ---- Caché en memoria de presentaciones ----
  // Con 100+ personas, findByCode se llamaba en cada conexión, voto, pregunta,
  // cambio de estado y revisión de salud. El servidor es el único que escribe
  // el estado (una sola instancia), así que se guarda el documento en memoria y
  // se actualiza al guardar. El TTL corto cubre ediciones hechas fuera del API.
  // También se comparten las consultas en vuelo: 100 conexiones simultáneas
  // a una presentación que no está en caché hacen UNA sola consulta.
  private readonly byCode = new Map<
    string,
    { at: number; doc: Promise<PresentationDocument> }
  >();
  private static readonly TTL_MS = 15_000;

  findByCode(code: string): Promise<PresentationDocument> {
    const key = code.toUpperCase();
    const hit = this.byCode.get(key);
    if (hit && Date.now() - hit.at < PresentationsService.TTL_MS)
      return hit.doc;
    const doc = withTimeout(
      this.presentationModel.findOne({ code: key }).exec(),
      `presentación ${key}`,
    ).then((p) => {
      if (!p) throw new NotFoundException(`Presentation ${code} not found`);
      return p;
    });
    doc.catch(() => this.byCode.delete(key));
    this.byCode.set(key, { at: Date.now(), doc });
    return doc;
  }

  private remember(p: PresentationDocument) {
    this.byCode.set(p.code, { at: Date.now(), doc: Promise.resolve(p) });
    this.activeCache = undefined;
  }

  // Solo el estado: sale de la caché (sin consultar la base).
  async getState(code: string): Promise<{ state: unknown; isActive: boolean }> {
    const p = await this.findByCode(code);
    return { state: p.state, isActive: p.isActive !== false };
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

    this.remember(presentation);
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
