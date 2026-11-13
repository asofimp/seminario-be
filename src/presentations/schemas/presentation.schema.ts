import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Survey } from '../../surveys/schemas/survey.schema';

// What participants see on their phones.
export enum AudienceView {
  WAITING = 'waiting',
  QUESTION = 'question',
  RESULTS = 'results',
  CLOSED = 'closed',
  // Ronda de preguntas: el público escribe preguntas de texto.
  QA = 'qa',
}

// What the projected general screen shows.
export enum ScreenView {
  LOBBY = 'lobby',
  QUESTION = 'question',
  RESULTS = 'results',
  SUMMARY = 'summary',
}

@Schema({ _id: false })
export class PresentationState {
  @Prop({ enum: AudienceView, default: AudienceView.WAITING })
  audienceView: AudienceView;

  @Prop({ enum: ScreenView, default: ScreenView.LOBBY })
  screenView: ScreenView;

  @Prop({ type: String, default: null })
  currentQuestionId: string | null;

  @Prop({ default: false })
  acceptingResponses: boolean;

  @Prop({ default: false })
  showResultsToAudience: boolean;

  // Diapositiva que muestra la pantalla proyectada (la controla el admin).
  @Prop({ default: 0, min: 0 })
  slideIndex: number;

  // Panel lateral de la diapositiva (ej. definición y analogía): lo abre el admin.
  @Prop({ default: false })
  showSidePanel: boolean;

  // Pregunta del público que la pantalla muestra en grande (ronda de preguntas).
  @Prop({ type: String, default: null })
  highlightedQuestionId: string | null;
}
export const PresentationStateSchema =
  SchemaFactory.createForClass(PresentationState);

@Schema({ timestamps: true })
export class Presentation {
  @Prop({ required: true, unique: true, uppercase: true })
  code: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: Types.ObjectId, ref: Survey.name, required: true })
  survey: Types.ObjectId;

  @Prop({ type: PresentationStateSchema, default: () => ({}) })
  state: PresentationState;

  // Solo puede haber una presentación activa a la vez (índice único parcial).
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  endedAt: Date | null;
}

export type PresentationDocument = HydratedDocument<Presentation>;
export const PresentationSchema = SchemaFactory.createForClass(Presentation);

PresentationSchema.index(
  { isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
