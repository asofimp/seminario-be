import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { withTimeout } from '../common/with-timeout';
import { PresentationsService } from '../presentations/presentations.service';
import { Response } from '../responses/schemas/response.schema';
import { Question, QuestionType } from '../surveys/schemas/survey.schema';

export interface OptionResult {
  value: string;
  label: string;
  count: number;
  percentage: number;
}

export interface QuestionResults {
  questionId: string;
  text: string;
  type: QuestionType;
  totalResponses: number;
  options?: OptionResult[];
  average?: number | null;
  distribution?: { value: number; count: number }[];
  latestAnswers?: string[];
}

const LATEST_TEXT_ANSWERS = 50;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Response.name) private readonly responseModel: Model<Response>,
    private readonly presentationsService: PresentationsService,
  ) {}

  async presentationResults(code: string): Promise<QuestionResults[]> {
    const { presentation, survey } =
      await this.presentationsService.getSnapshot(code);
    return Promise.all(
      survey.questions.map((q) => this.computeQuestion(presentation._id, q)),
    );
  }

  // Resultados en memoria hasta el siguiente voto de esa pregunta: las
  // conexiones nuevas (pantalla, panel, celulares) no recalculan nada.
  private readonly resultsCache = new Map<string, Promise<QuestionResults>>();

  invalidate(code: string, questionId: string) {
    this.resultsCache.delete(`${code.toUpperCase()}:${questionId}`);
  }

  questionResults(code: string, questionId: string): Promise<QuestionResults> {
    const key = `${code.toUpperCase()}:${questionId}`;
    const hit = this.resultsCache.get(key);
    if (hit) return hit;
    const value = this.computeQuestionResults(code, questionId);
    value.catch(() => this.resultsCache.delete(key));
    this.resultsCache.set(key, value);
    return value;
  }

  private async computeQuestionResults(
    code: string,
    questionId: string,
  ): Promise<QuestionResults> {
    const { presentation, survey } =
      await this.presentationsService.getSnapshot(code);
    const question = survey.questions.id(questionId);
    if (!question) {
      throw new NotFoundException(`Question ${questionId} not found`);
    }
    return this.computeQuestion(presentation._id, question);
  }

  private async computeQuestion(
    presentationId: Types.ObjectId,
    question: Question,
  ): Promise<QuestionResults> {
    const questionId = question._id.toString();
    const hasOptions =
      question.type === QuestionType.SINGLE ||
      question.type === QuestionType.MULTIPLE;
    // En preguntas de opciones solo cuentan los votos de opciones vigentes
    // (si se editan las opciones, los votos viejos no distorsionan el total).
    const match = hasOptions
      ? {
          presentation: presentationId,
          questionId,
          value: { $in: question.options.map((o) => o.value) },
        }
      : { presentation: presentationId, questionId };
    // Una sola consulta: total de respuestas y conteo por opción a la vez.
    const [facet] = await withTimeout(
      this.responseModel
        .aggregate<{
          total: { n: number }[];
          counts: { _id: string | number; count: number }[];
        }>([
          { $match: match },
          {
            $facet: {
              total: [{ $count: 'n' }],
              // $unwind trata un valor simple como arreglo de un elemento: sirve
              // para opción única, múltiple y escala.
              counts: [
                { $unwind: '$value' },
                { $group: { _id: '$value', count: { $sum: 1 } } },
              ],
            },
          },
        ])
        .exec(),
      `resultados ${questionId}`,
    );
    const totalResponses = facet?.total[0]?.n ?? 0;
    const base = {
      questionId,
      text: question.text,
      type: question.type,
      totalResponses,
    };

    if (question.type === QuestionType.TEXT) {
      const latest = await this.responseModel
        .find(match)
        .sort({ updatedAt: -1 })
        .limit(LATEST_TEXT_ANSWERS)
        .lean()
        .exec();
      return { ...base, latestAnswers: latest.map((r) => String(r.value)) };
    }

    const counts = facet?.counts ?? [];
    const countBy = new Map(counts.map((c) => [String(c._id), c.count]));

    if (question.type === QuestionType.SCALE) {
      const min = question.min ?? 1;
      const max = question.max ?? 5;
      const distribution = Array.from({ length: max - min + 1 }, (_, i) => ({
        value: min + i,
        count: countBy.get(String(min + i)) ?? 0,
      }));
      const sum = distribution.reduce((acc, d) => acc + d.value * d.count, 0);
      return {
        ...base,
        distribution,
        average: totalResponses ? sum / totalResponses : null,
      };
    }

    return {
      ...base,
      options: question.options.map((o) => {
        const count = countBy.get(o.value) ?? 0;
        return {
          value: o.value,
          label: o.label,
          count,
          percentage: totalResponses ? (count / totalResponses) * 100 : 0,
        };
      }),
    };
  }
}
