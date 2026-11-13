import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePresentationDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsMongoId()
  surveyId: string;

  // Práctica: se pueden tener varias activas a la vez.
  @IsOptional()
  @IsBoolean()
  practice?: boolean;
}
