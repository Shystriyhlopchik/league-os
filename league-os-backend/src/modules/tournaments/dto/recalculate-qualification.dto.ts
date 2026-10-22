import { OmitType } from '@nestjs/mapped-types';

import { PreviewQualificationDto } from './preview-qualification.dto';

export class RecalculateQualificationDto extends OmitType(
  PreviewQualificationDto,
  ['ruleVersionId'] as const,
) {}
