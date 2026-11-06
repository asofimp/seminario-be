import { IsDefined, IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import type { AnswerValue } from '../schemas/response.schema';

export class SubmitResponseDto {
  @IsString()
  @IsNotEmpty()
  participantId: string;

  @IsMongoId()
  questionId: string;

  // Shape depends on the question type; checked in ResponsesService.
  @IsDefined()
  value: AnswerValue;
}
