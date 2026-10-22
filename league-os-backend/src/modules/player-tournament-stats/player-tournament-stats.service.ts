import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { MatchEntity } from '../matches/entities/match.entity';
import { PlayerSuspensionsService } from '../player-suspensions/player-suspensions.service';
import { PlayerTournamentStatEntity } from './entities/player-tournament-stat.entity';

@Injectable()
export class PlayerTournamentStatsService {
  constructor(
    @InjectRepository(PlayerTournamentStatEntity)
    private readonly statRepository: Repository<PlayerTournamentStatEntity>,
    private readonly playerSuspensionsService: PlayerSuspensionsService,
  ) {}

  async applyCardEvent(params: {
    match: MatchEntity;
    teamId: number;
    playerId: number;
    eventType: MatchEventType;
  }): Promise<void> {
    const { match, teamId, playerId, eventType } = params;

    if (!this.isCardEvent(eventType)) return;

    const stat = await this.getOrCreateStat({
      tournamentId: match.tournamentId,
      teamId,
      playerId,
    });
    if (eventType === MatchEventType.YELLOW_CARD) stat.yellowCards += 1;
    if (eventType === MatchEventType.RED_CARD) stat.redCards += 1;
    if (eventType === MatchEventType.SECOND_YELLOW_CARD) {
      stat.secondYellowCards += 1;
    }
    // Transitional legacy columns remain readable, but no longer determine
    // eligibility or point to a particular future match.
    stat.isSuspended = false;
    stat.suspendedUntilMatchId = undefined;
    stat.suspensionReason = undefined;
    await this.statRepository.save(stat);
    await this.playerSuspensionsService.applyCardEvent(params);
  }

  private async getOrCreateStat(params: {
    tournamentId: number;
    teamId: number;
    playerId: number;
  }): Promise<PlayerTournamentStatEntity> {
    const existing = await this.statRepository.findOne({ where: params });
    if (existing) return existing;
    return this.statRepository.create({
      ...params,
      yellowCards: 0,
      redCards: 0,
      secondYellowCards: 0,
      suspensionsServed: 0,
      isSuspended: false,
    });
  }

  private isCardEvent(eventType: MatchEventType): boolean {
    return [
      MatchEventType.YELLOW_CARD,
      MatchEventType.RED_CARD,
      MatchEventType.SECOND_YELLOW_CARD,
    ].includes(eventType);
  }

  async serveSuspensionsForMatch(matchId: number): Promise<void> {
    await this.playerSuspensionsService.serveSuspensionsForMatch(matchId);
  }

  async revertCardEvent(params: {
    match: MatchEntity;
    teamId: number;
    playerId: number;
    eventType: MatchEventType;
  }): Promise<void> {
    if (!this.isCardEvent(params.eventType)) return;
    const stat = await this.statRepository.findOne({
      where: {
        tournamentId: params.match.tournamentId,
        teamId: params.teamId,
        playerId: params.playerId,
      },
    });
    if (stat) {
      if (params.eventType === MatchEventType.YELLOW_CARD) {
        stat.yellowCards = Math.max(0, stat.yellowCards - 1);
      } else if (params.eventType === MatchEventType.RED_CARD) {
        stat.redCards = Math.max(0, stat.redCards - 1);
      } else {
        stat.secondYellowCards = Math.max(0, stat.secondYellowCards - 1);
      }
      await this.statRepository.save(stat);
    }
    await this.playerSuspensionsService.revertCardEvent(params);
  }
}
