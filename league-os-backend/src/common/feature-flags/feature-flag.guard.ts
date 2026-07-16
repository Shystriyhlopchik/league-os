import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from './feature-flags.service';
import { FEATURE_FLAG_METADATA } from './require-feature.decorator';
import { FeatureFlag } from './feature-flag.enum';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<FeatureFlag>(
      FEATURE_FLAG_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!flag || this.flags.isEnabled(flag)) return true;
    throw new NotFoundException('Feature is disabled');
  }
}
