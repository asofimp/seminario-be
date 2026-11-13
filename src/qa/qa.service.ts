import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Events, QaChangedEvent } from '../common/events';
import { PresentationsService } from '../presentations/presentations.service';
import { AudienceView } from '../presentations/schemas/presentation.schema';
import { withTimeout } from '../common/with-timeout';
import { AskQuestionDto } from './dto/ask-question.dto';
import {
  AudienceQuestion,
  AudienceQuestionDocument,
} from './schemas/audience-question.schema';

// Máximo de preguntas por participante en una presentación (evita spam).
const MAX_PER_PARTICIPANT = 10;

@Injectable()
export class QaService {
  constructor(
    @InjectModel(AudienceQuestion.name)
    private readonly questionModel: Model<AudienceQuestion>,
    private readonly presentationsService: PresentationsService,
    private readonly events: EventEmitter2,
  ) {}

  // Solo se aceptan preguntas mientras la ronda de preguntas está abierta.
  async ask(
    code: string,
    dto: AskQuestionDto,
  ): Promise<AudienceQuestionDocument> {
    const presentation = await this.presentationsService.findByCode(code);
    if (
      presentation.isActive === false ||
      presentation.state.audienceView !== AudienceView.QA
    ) {
      throw new ConflictException('La ronda de preguntas no está abierta');
    }

    const count = await this.questionModel.countDocuments({
      presentation: presentation._id,
      participantId: dto.participantId,
    });
    if (count >= MAX_PER_PARTICIPANT) {
      throw new ConflictException(
        `Puedes enviar hasta ${MAX_PER_PARTICIPANT} preguntas`,
      );
    }

    const question = await this.questionModel.create({
      presentation: presentation._id,
      participantId: dto.participantId,
      participantName: dto.participantName.trim(),
      text: dto.text.trim(),
    });
    this.emitChanged(presentation.code);
    return question;
  }

  // Lista en memoria: cada conexión nueva la pedía (100 conexiones = 100
  // consultas). Se invalida al preguntar o marcar respondida.
  private readonly listCache = new Map<string, Promise<AudienceQuestion[]>>();

  list(code: string): Promise<AudienceQuestion[]> {
    const key = code.toUpperCase();
    const hit = this.listCache.get(key);
    if (hit) return hit;
    const value = this.presentationsService
      .findByCode(key)
      .then((presentation) =>
        withTimeout(
          this.questionModel
            .find({ presentation: presentation._id })
            .sort({ createdAt: 1 })
            .lean()
            .exec(),
          `preguntas ${key}`,
        ),
      );
    value.catch(() => this.listCache.delete(key));
    this.listCache.set(key, value);
    return value;
  }

  async setAnswered(
    code: string,
    id: string,
    answered: boolean,
  ): Promise<AudienceQuestionDocument> {
    const presentation = await this.presentationsService.findByCode(code);
    const question = isValidObjectId(id)
      ? await this.questionModel
          .findOneAndUpdate(
            { _id: id, presentation: presentation._id },
            { $set: { answered } },
            { new: true },
          )
          .exec()
      : null;
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    this.emitChanged(presentation.code);
    return question;
  }

  private emitChanged(code: string) {
    this.listCache.delete(code.toUpperCase());
    this.events.emit(Events.QA_CHANGED, { code } satisfies QaChangedEvent);
  }
}
