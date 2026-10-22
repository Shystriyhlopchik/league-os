import type { ConfigService } from '@nestjs/config';
import { FeatureFlag } from './feature-flag.enum';
import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  it('keeps rollout features disabled by default', () => {
    const service = new FeatureFlagsService({
      get: jest.fn(() => undefined),
    } as unknown as ConfigService);

    expect(service.isEnabled(FeatureFlag.TournamentBuilder)).toBe(false);
    expect(service.isEnabled(FeatureFlag.MultiStagePublicView)).toBe(false);
  });

  it('accepts common explicit true values', () => {
    const service = new FeatureFlagsService({
      get: jest.fn(() => 'on'),
    } as unknown as ConfigService);

    expect(service.publicFlags()).toEqual({
      tournamentBuilder: true,
      multiStagePublicView: true,
    });
  });
});
