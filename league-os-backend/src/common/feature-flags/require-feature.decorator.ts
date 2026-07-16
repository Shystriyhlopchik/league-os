import { SetMetadata } from '@nestjs/common';
import { FeatureFlag } from './feature-flag.enum';

export const FEATURE_FLAG_METADATA = 'league-os:feature-flag';
export const RequireFeature = (flag: FeatureFlag) =>
  SetMetadata(FEATURE_FLAG_METADATA, flag);
