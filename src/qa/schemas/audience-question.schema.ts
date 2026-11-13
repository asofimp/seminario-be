import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Presentation } from '../../presentations/schemas/presentation.schema';

// Pregunta de texto que el público envía en la ronda de preguntas.
// Un participante puede enviar varias (para profundizar en un tema).
@Schema({ timestamps: true })
export class AudienceQuestion {
  @Prop({
    type: Types.ObjectId,
    ref: Presentation.name,
    required: true,
    index: true,
  })
  presentation: Types.ObjectId;

  @Prop({ required: true })
  participantId: string;

  @Prop({ required: true })
  participantName: string;

  @Prop({ required: true, maxlength: 300 })
  text: string;

  @Prop({ default: false })
  answered: boolean;
}

export type AudienceQuestionDocument = HydratedDocument<AudienceQuestion>;
export const AudienceQuestionSchema =
  SchemaFactory.createForClass(AudienceQuestion);

// Lista ordenada de la ronda y límite de preguntas por participante.
AudienceQuestionSchema.index({ presentation: 1, createdAt: 1 });
AudienceQuestionSchema.index({ presentation: 1, participantId: 1 });
