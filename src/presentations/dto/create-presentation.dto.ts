import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class CreatePresentationDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsMongoId()
  surveyId: string;
}
