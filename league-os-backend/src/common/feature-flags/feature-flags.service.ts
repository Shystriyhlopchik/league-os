import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlag } from './feature-flag.enum';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(flag: FeatureFlag): boolean {
    const environmentKey: Record<FeatureFlag, string> = {
      [FeatureFlag.TournamentBuilder]: 'TOURNAMENT_BUILDER_ENABLED',
      [FeatureFlag.MultiStagePublicView]:
        'MULTI_STAGE_PUBLIC_VIEW_ENABLED',
    };
    return this.boolean(environmentKey[flag], false);
  }

  publicFlags(): Record<FeatureFlag, boolean> {
    return {
      [FeatureFlag.TournamentBuilder]: this.isEnabled(
        FeatureFlag.TournamentBuilder,
      ),
      [FeatureFlag.MultiStagePublicView]: this.isEnabled(
        FeatureFlag.MultiStagePublicView,
      ),
    };
  }

  private boolean(key: string, defaultValue: boolean): boolean {
    const value = this.config.get<string | boolean>(key);
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
}
