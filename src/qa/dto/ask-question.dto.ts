import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AskQuestionDto {
  @IsString()
  @IsNotEmpty()
  participantId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  participantName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text: string;
}
