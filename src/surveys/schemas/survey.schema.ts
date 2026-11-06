import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum QuestionType {
  SINGLE = 'single',
  MULTIPLE = 'multiple',
  SCALE = 'scale',
  TEXT = 'text',
}

@Schema({ _id: false })
export class QuestionOption {
  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  label: string;
}
export const QuestionOptionSchema =
  SchemaFactory.createForClass(QuestionOption);

@Schema()
export class Question {
  _id: Types.ObjectId;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true, enum: QuestionType })
  type: QuestionType;

  @Prop({ type: [QuestionOptionSchema], default: [] })
  options: QuestionOption[];

  @Prop()
  min?: number;

  @Prop()
  max?: number;
}
export const QuestionSchema = SchemaFactory.createForClass(Question);

@Schema({ timestamps: true })
export class Survey {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: [QuestionSchema], default: [] })
  questions: Types.DocumentArray<Question>;
}

export type SurveyDocument = HydratedDocument<Survey>;
export const SurveySchema = SchemaFactory.createForClass(Survey);
