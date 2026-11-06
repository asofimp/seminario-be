import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  Min,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { AudienceView, ScreenView } from '../schemas/presentation.schema';

export class UpdateStateDto {
  @IsOptional()
  @IsEnum(AudienceView)
  audienceView?: AudienceView;

  @IsOptional()
  @IsEnum(ScreenView)
  screenView?: ScreenView;

  @IsOptional()
  @ValidateIf((dto: UpdateStateDto) => dto.currentQuestionId !== null)
  @IsMongoId()
  currentQuestionId?: string | null;

  @IsOptional()
  @IsBoolean()
  acceptingResponses?: boolean;

  @IsOptional()
  @IsBoolean()
  showResultsToAudience?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  slideIndex?: number;
}
