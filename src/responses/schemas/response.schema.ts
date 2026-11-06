import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Presentation } from '../../presentations/schemas/presentation.schema';

export type AnswerValue = string | string[] | number;

// One document per participant per question, so a participant can change
// their vote and per-question aggregations stay cheap.
@Schema({ timestamps: true })
export class Response {
  @Prop({ type: Types.ObjectId, ref: Presentation.name, required: true })
  presentation: Types.ObjectId;

  @Prop({ required: true })
  questionId: string;

  @Prop({ required: true })
  participantId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value: AnswerValue;
}

export type ResponseDocument = HydratedDocument<Response>;
export const ResponseSchema = SchemaFactory.createForClass(Response);

ResponseSchema.index(
  { presentation: 1, questionId: 1, participantId: 1 },
  { unique: true },
);
