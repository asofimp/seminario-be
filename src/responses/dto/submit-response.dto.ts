import {
  IsDefined,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { AnswerValue } from '../schemas/response.schema';

export class SubmitResponseDto {
  @IsString()
  @IsNotEmpty()
  participantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  participantName?: string;

  @IsMongoId()
  questionId: string;

  // Shape depends on the question type; checked in ResponsesService.
  @IsDefined()
  value: AnswerValue;
}
