import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Events, ResponseSubmittedEvent } from '../common/events';
import { PresentationsService } from '../presentations/presentations.service';
import { Question, QuestionType } from '../surveys/schemas/survey.schema';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { AnswerValue, Response } from './schemas/response.schema';

// Ventana para juntar votos y tamaño máximo de un lote.
const BATCH_WINDOW_MS = 150;
const BATCH_MAX = 200;
const MAX_ATTEMPTS = 5;

interface QueuedVote {
  code: string;
  presentation: Types.ObjectId;
  questionId: string;
  participantId: string;
  value: AnswerValue;
  participantName?: string;
}

@Injectable()
export class ResponsesService implements OnApplicationShutdown {
  constructor(
    @InjectModel(Response.name) private readonly responseModel: Model<Response>,
    private readonly presentationsService: PresentationsService,
    private readonly events: EventEmitter2,
  ) {}

  async submit(code: string, dto: SubmitResponseDto): Promise<{ ok: true }> {
    const { presentation, survey } =
      await this.presentationsService.getSnapshot(code);
    const { state } = presentation;

    if (
      !state.acceptingResponses ||
      state.currentQuestionId !== dto.questionId
    ) {
      throw new ConflictException('This question is not open for responses');
    }

    const question = survey.questions.id(dto.questionId);
    if (!question) {
      throw new BadRequestException('Unknown question');
    }
    const value = this.normalizeValue(question, dto.value);

    // Se confirma al validar y encolar: la escritura a MongoDB va agrupada en
    // segundo plano (Atlas tarda; el público no espera por ella).
    this.enqueue({
      code: presentation.code,
      presentation: presentation._id,
      questionId: dto.questionId,
      participantId: dto.participantId,
      value,
      participantName: dto.participantName?.trim() || undefined,
    });

    return { ok: true };
  }

  // ---- Escritura agrupada de votos (en segundo plano) ----
  // Con 100+ personas votando a la vez, una escritura por voto hace fila en el
  // pool de MongoDB (cada una es un viaje a Atlas). Se juntan los votos que
  // llegan en una ventana corta y se escriben en UNA operación (bulkWrite).
  // Si falla, el lote se reintenta. Al guardarse, se avisa para recalcular
  // resultados (así siempre incluyen los votos nuevos).
  private queue: { op: QueuedVote; attempts: number }[] = [];
  private flushTimer?: NodeJS.Timeout;
  private flushing = false;
  private readonly logger = new Logger(ResponsesService.name);

  // Al apagarse (reinicio o redespliegue en Render), guarda lo pendiente.
  async onApplicationShutdown() {
    for (let i = 0; i < 20 && (this.queue.length > 0 || this.flushing); i++) {
      if (this.flushing) await new Promise((r) => setTimeout(r, 100));
      else await this.flush();
    }
  }

  private enqueue(op: QueuedVote) {
    this.queue.push({ op, attempts: 0 });
    if (this.queue.length >= BATCH_MAX) void this.flush();
    else
      this.flushTimer ??= setTimeout(() => void this.flush(), BATCH_WINDOW_MS);
  }

  private async flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    if (this.flushing) {
      // Ya hay un lote en camino: el siguiente sale cuando termine.
      this.flushTimer = setTimeout(() => void this.flush(), BATCH_WINDOW_MS);
      return;
    }
    const batch = this.queue.splice(0, BATCH_MAX);
    if (batch.length === 0) return;
    this.flushing = true;
    // Si alguien votó dos veces en el mismo lote, gana el último voto.
    const last = new Map<string, QueuedVote>();
    for (const { op } of batch) {
      last.set(
        `${String(op.presentation)}:${op.questionId}:${op.participantId}`,
        op,
      );
    }
    const t0 = Date.now();
    try {
      await this.responseModel.bulkWrite(
        [...last.values()].map((op) => ({
          updateOne: {
            filter: {
              presentation: op.presentation,
              questionId: op.questionId,
              participantId: op.participantId,
            },
            update: {
              $set: {
                value: op.value,
                ...(op.participantName && {
                  participantName: op.participantName,
                }),
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      this.logger.log(
        `[votos] lote de ${last.size} guardado en ${Date.now() - t0}ms`,
      );
      // Un aviso por pregunta del lote para recalcular sus resultados.
      const touched = new Map<string, ResponseSubmittedEvent>();
      for (const op of last.values()) {
        touched.set(`${op.code}:${op.questionId}`, {
          code: op.code,
          questionId: op.questionId,
        });
      }
      for (const ev of touched.values())
        this.events.emit(Events.RESPONSE_SUBMITTED, ev);
    } catch (err) {
      const retry = batch.filter((b) => ++b.attempts < MAX_ATTEMPTS);
      this.logger.error(
        `[votos] falló un lote de ${batch.length} (${(err as Error).message}); se reintentan ${retry.length}`,
      );
      this.queue.unshift(...retry);
    } finally {
      this.flushing = false;
      if (this.queue.length > 0) {
        this.flushTimer ??= setTimeout(
          () => void this.flush(),
          BATCH_WINDOW_MS,
        );
      }
    }
  }

  private normalizeValue(question: Question, value: AnswerValue): AnswerValue {
    const allowed = new Set(question.options.map((o) => o.value));

    switch (question.type) {
      case QuestionType.SINGLE:
        if (typeof value !== 'string' || !allowed.has(value)) {
          throw new BadRequestException('Expected one of the question options');
        }
        return value;

      case QuestionType.MULTIPLE: {
        const values = Array.isArray(value) ? value : [value];
        if (
          values.length === 0 ||
          !values.every((v) => typeof v === 'string' && allowed.has(v))
        ) {
          throw new BadRequestException('Expected a list of question options');
        }
        return [...new Set(values as string[])];
      }

      case QuestionType.SCALE: {
        const n = Number(value);
        const min = question.min ?? 1;
        const max = question.max ?? 5;
        if (!Number.isInteger(n) || n < min || n > max) {
          throw new BadRequestException(
            `Expected an integer from ${min} to ${max}`,
          );
        }
        return n;
      }

      case QuestionType.TEXT: {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text || text.length > 500) {
          throw new BadRequestException('Expected text up to 500 characters');
        }
        return text;
      }
    }
  }
}
