import { Injectable } from '@nestjs/common';
import {InjectRepository} from "@nestjs/typeorm";
import {PlayerTournamentStatEntity} from "./entities/player-tournament-stat.entity";
import {Repository} from "typeorm";
import {MatchEntity} from "../matches/entities/match.entity";
import {MatchEventType} from "../match-events/enums/match-event-type.enum";
import {SuspensionReason} from "./enums/suspension-reason.enum";

@Injectable()
export class PlayerTournamentStatsService {
    constructor(
        @InjectRepository(PlayerTournamentStatEntity)
        private readonly statRepository: Repository<PlayerTournamentStatEntity>,

        @InjectRepository(MatchEntity)
        private readonly matchRepository: Repository<MatchEntity>,
    ) {}

    async applyCardEvent(params: {
        match: MatchEntity;
        teamId: number;
        playerId: number;
        eventType: MatchEventType;
    }): Promise<void> {
        const { match, teamId, playerId, eventType } = params;

        if (!this.isCardEvent(eventType)) {
            return;
        }

        const stat = await this.getOrCreateStat({
            tournamentId: match.tournamentId,
            teamId,
            playerId,
        });

        if (eventType === MatchEventType.YELLOW_CARD) {
            stat.yellowCards += 1;

            if (stat.yellowCards >= 4) {
                stat.isSuspended = true;
                stat.suspensionReason = SuspensionReason.FOUR_YELLOW_CARDS;
                stat.suspendedUntilMatchId = await this.findNextTeamMatchId(match, teamId);
            }
        }

        if (eventType === MatchEventType.RED_CARD) {
            stat.redCards += 1;
            stat.isSuspended = true;
            stat.suspensionReason = SuspensionReason.RED_CARD;
            stat.suspendedUntilMatchId = await this.findNextTeamMatchId(match, teamId);
        }

        if (eventType === MatchEventType.SECOND_YELLOW_CARD) {
            stat.secondYellowCards += 1;
            stat.isSuspended = true;
            stat.suspensionReason = SuspensionReason.SECOND_YELLOW_CARD;
            stat.suspendedUntilMatchId = await this.findNextTeamMatchId(match, teamId);
        }

        await this.statRepository.save(stat);
    }

    private async getOrCreateStat(params: {
        tournamentId: number;
        teamId: number;
        playerId: number;
    }): Promise<PlayerTournamentStatEntity> {
        const { tournamentId, teamId, playerId } = params;

        const existing = await this.statRepository.findOne({
            where: {
                tournamentId,
                teamId,
                playerId,
            },
        });

        if (existing) {
            return existing;
        }

        return this.statRepository.create({
            tournamentId,
            teamId,
            playerId,
            yellowCards: 0,
            redCards: 0,
            secondYellowCards: 0,
            suspensionsServed: 0,
            isSuspended: false,
        });
    }

    private async findNextTeamMatchId(
        currentMatch: MatchEntity,
        teamId: number,
    ): Promise<number | undefined> {
        if (!currentMatch.matchDatetime) {
            return undefined;
        }

        const nextMatch = await this.matchRepository
            .createQueryBuilder('match')
            .where('match.tournament_id = :tournamentId', {
                tournamentId: currentMatch.tournamentId,
            })
            .andWhere('match.match_datetime > :currentDate', {
                currentDate: currentMatch.matchDatetime,
            })
            .andWhere(
                '(match.home_team_id = :teamId OR match.away_team_id = :teamId)',
                { teamId },
            )
            .orderBy('match.match_datetime', 'ASC')
            .addOrderBy('match.id', 'ASC')
            .getOne();

        return nextMatch?.id;
    }

    private isCardEvent(eventType: MatchEventType): boolean {
        return [
            MatchEventType.YELLOW_CARD,
            MatchEventType.RED_CARD,
            MatchEventType.SECOND_YELLOW_CARD,
        ].includes(eventType);
    }

    async serveSuspensionsForMatch(matchId: number): Promise<void> {
        const suspendedStats = await this.statRepository.find({
            where: {
                suspendedUntilMatchId: matchId,
                isSuspended: true,
            },
        });

        if (!suspendedStats.length) {
            return;
        }

        suspendedStats.forEach((stat) => {
            stat.isSuspended = false;
            stat.suspendedUntilMatchId = undefined;
            stat.suspensionReason = undefined;
            stat.suspensionsServed += 1;

            if (stat.yellowCards >= 4) {
                stat.yellowCards = 0;
            }
        });

        await this.statRepository.save(suspendedStats);
    }
}
