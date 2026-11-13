import { IsBoolean } from 'class-validator';

export class UpdateAudienceQuestionDto {
  @IsBoolean()
  answered: boolean;
}
