import { Module } from '@nestjs/common';
import { TeamAccessService } from './team-access.service';
@Module({ providers: [TeamAccessService], exports: [TeamAccessService] })
export class TeamAccessModule {}
