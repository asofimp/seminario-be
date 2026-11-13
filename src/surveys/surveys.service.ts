import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { Survey, SurveyDocument } from './schemas/survey.schema';

// Las encuestas casi no cambian: se guardan en memoria para no consultar
// MongoDB en cada voto y en cada conexión (el servidor corre con 0.1 de CPU).
const CACHE_TTL_MS = 5 * 60_000;

@Injectable()
export class SurveysService {
  private readonly cache = new Map<
    string,
    { survey: SurveyDocument; at: number }
  >();

  constructor(
    @InjectModel(Survey.name) private readonly surveyModel: Model<Survey>,
  ) {}

  create(dto: CreateSurveyDto): Promise<SurveyDocument> {
    return this.surveyModel.create(dto);
  }

  findAll(): Promise<SurveyDocument[]> {
    return this.surveyModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string | Types.ObjectId): Promise<SurveyDocument> {
    const key = String(id);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.survey;
    const survey = Types.ObjectId.isValid(id)
      ? await this.surveyModel.findById(id).exec()
      : null;
    if (!survey) {
      throw new NotFoundException(`Survey ${String(id)} not found`);
    }
    this.cache.set(key, { survey, at: Date.now() });
    return survey;
  }

  async replace(id: string, dto: CreateSurveyDto): Promise<SurveyDocument> {
    const survey = await this.findOne(id);
    survey.set(dto);
    const saved = await survey.save();
    this.cache.delete(id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const survey = await this.findOne(id);
    await survey.deleteOne();
    this.cache.delete(id);
  }
}
