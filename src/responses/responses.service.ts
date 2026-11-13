import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Events, ResponseSubmittedEvent } from '../common/events';
import { PresentationsService } from '../presentations/presentations.service';
import { Question, QuestionType } from '../surveys/schemas/survey.schema';
import { SubmitResponseDto } from './dto/submit-response.dto';
import {
  AnswerValue,
  Response,
  ResponseDocument,
} from './schemas/response.schema';

@Injectable()
export class ResponsesService {
  constructor(
    @InjectModel(Response.name) private readonly responseModel: Model<Response>,
    private readonly presentationsService: PresentationsService,
    private readonly events: EventEmitter2,
  ) {}

  async submit(
    code: string,
    dto: SubmitResponseDto,
  ): Promise<ResponseDocument> {
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

    const response = await this.responseModel
      .findOneAndUpdate(
        {
          presentation: presentation._id,
          questionId: dto.questionId,
          participantId: dto.participantId,
        },
        {
          $set: {
            value,
            ...(dto.participantName && {
              participantName: dto.participantName.trim(),
            }),
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    this.events.emit(Events.RESPONSE_SUBMITTED, {
      code: presentation.code,
      questionId: dto.questionId,
    } satisfies ResponseSubmittedEvent);

    return response;
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
