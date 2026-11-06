import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { Survey, SurveyDocument } from './schemas/survey.schema';

@Injectable()
export class SurveysService {
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
    const survey = Types.ObjectId.isValid(id)
      ? await this.surveyModel.findById(id).exec()
      : null;
    if (!survey) {
      throw new NotFoundException(`Survey ${String(id)} not found`);
    }
    return survey;
  }

  async replace(id: string, dto: CreateSurveyDto): Promise<SurveyDocument> {
    const survey = await this.findOne(id);
    survey.set(dto);
    return survey.save();
  }

  async remove(id: string): Promise<void> {
    const survey = await this.findOne(id);
    await survey.deleteOne();
  }
}
