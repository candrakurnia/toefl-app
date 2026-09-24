import { IsBoolean, IsIn, IsISO8601, IsObject, IsOptional, IsString } from 'class-validator';
import { VIOLATION_TYPES, ViolationType } from '@toefl/shared';

export class AutosaveDto {
  @IsString()
  questionId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class HeartbeatDto {
  @IsOptional()
  @IsIn(['visible', 'hidden'])
  visibility?: 'visible' | 'hidden';

  @IsOptional()
  @IsBoolean()
  fullscreen?: boolean;
}

export class ViolationDto {
  @IsIn(VIOLATION_TYPES)
  type!: ViolationType;

  @IsISO8601()
  at!: string;
}
