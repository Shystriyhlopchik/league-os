import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { PlayerTournamentStatEntity } from '../player-tournament-stats/entities/player-tournament-stat.entity';
import { TeamEntity } from '../teams/entities/team.entity';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import {
  PlayerCardDto,
  PlayerCardPositionCode,
  PlayerCardRatingsDto,
  TournamentPlayerCardsDto,
} from './dto/player-card.dto';
import { PlayerEntity } from './entities/player.entity';
import { PlayerPosition } from './enums/player-position.enum';
import { PreferredFoot } from './enums/preferred-foot.enum';

interface LatestPlayerSnapshot {
  matchId: number;
  team: TeamEntity;
  shirtNumber: number | null;
  position?: PlayerPosition;
}

interface PlayerCardAccumulator {
  player: PlayerEntity;
  appearances: Set<number>;
  contributionsByMatch: Map<number, number>;
  goals: number;
  assists: number;
  yellowCards: number;
  secondYellowCards: number;
  redCards: number;
  suspensions: number;
  latest?: LatestPlayerSnapshot;
}

interface RawPlayerCard {
  accumulator: PlayerCardAccumulator;
  positionKey: PlayerPosition | 'unknown';
  matches: number;
  recentMatchIds: number[];
  recentGoalContributions: number;
  recentContributingMatches: number;
  adjustedGoalsPerMatch: number;
  adjustedAssistsPerMatch: number;
  adjustedContributionsPerMatch: number;
  adjustedRecentContributionsPerMatch: number;
  adjustedRecentContributingShare: number;
  ratings?: Omit<PlayerCardRatingsDto, 'ovr'>;
  provisionalOvr?: number;
}

type PositionWeights = Record<keyof Omit<PlayerCardRatingsDto, 'ovr'>, number>;

const POSITION_WEIGHTS: Record<
  PlayerPosition | 'unknown',
  PositionWeights
> = {
  [PlayerPosition.FORWARD]: {
    att: 0.35,
    cre: 0.15,
    form: 0.15,
    exp: 0.1,
    disc: 0.05,
    imp: 0.2,
  },
  [PlayerPosition.WINGER]: {
    att: 0.2,
    cre: 0.25,
    form: 0.15,
    exp: 0.1,
    disc: 0.1,
    imp: 0.2,
  },
  [PlayerPosition.DEFENDER]: {
    att: 0.1,
    cre: 0.1,
    form: 0.1,
    exp: 0.3,
    disc: 0.3,
    imp: 0.1,
  },
  [PlayerPosition.GOALKEEPER]: {
    att: 0.05,
    cre: 0.05,
    form: 0.1,
    exp: 0.35,
    disc: 0.4,
    imp: 0.05,
  },
  unknown: {
    att: 0.2,
    cre: 0.15,
    form: 0.15,
    exp: 0.2,
    disc: 0.15,
    imp: 0.15,
  },
};

@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(MatchRosterPlayerEntity)
    private readonly matchRosterPlayerRepository: Repository<MatchRosterPlayerEntity>,
    @InjectRepository(MatchEventEntity)
    private readonly matchEventRepository: Repository<MatchEventEntity>,
    @InjectRepository(PlayerTournamentStatEntity)
    private readonly playerTournamentStatRepository: Repository<PlayerTournamentStatEntity>,
  ) {}

  async getTournamentCards(
    tournamentId: number,
  ): Promise<TournamentPlayerCardsDto> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      select: { id: true, name: true },
    });
    if (!tournament) {
      throw new NotFoundException('Турнир не найден');
    }

    const matches = await this.matchRepository.find({
      where: {
        tournamentId,
        status: MatchStatus.FINISHED,
      },
      select: {
        id: true,
        matchDatetime: true,
      },
    });
    const matchIds = matches.map((match) => match.id);
    if (!matchIds.length) {
      return {
        tournamentId,
        tournamentName: tournament.name,
        ratingVersion: 1,
        players: [],
      };
    }

    const matchById = new Map(matches.map((match) => [match.id, match]));
    const [rosterPlayers, events] = await Promise.all([
      this.matchRosterPlayerRepository.find({
        where: {
          matchRoster: { matchId: In(matchIds) },
          wasAllowed: true,
        },
        relations: {
          player: true,
          matchRoster: {
            team: true,
          },
        },
      }),
      this.matchEventRepository.find({
        where: {
          matchId: In(matchIds),
          isCancelled: false,
        },
        order: { id: 'ASC' },
      }),
    ]);

    const players = new Map<number, PlayerCardAccumulator>();
    for (const rosterPlayer of rosterPlayers) {
      const accumulator = this.getOrCreateAccumulator(
        players,
        rosterPlayer.player,
      );
      const matchId = rosterPlayer.matchRoster.matchId;
      accumulator.appearances.add(matchId);

      if (
        !accumulator.latest ||
        this.isLaterMatch(
          matchById.get(matchId),
          matchById.get(accumulator.latest.matchId),
        )
      ) {
        accumulator.latest = {
          matchId,
          team: rosterPlayer.matchRoster.team,
          shirtNumber: rosterPlayer.shirtNumber ?? null,
          position: rosterPlayer.position ?? rosterPlayer.player.position,
        };
      }
    }

    this.applyEvents(players, events);
    const playerIds = [...players.keys()];
    if (playerIds.length) {
      const disciplineStats = await this.playerTournamentStatRepository.find({
        where: {
          tournamentId,
          playerId: In(playerIds),
        },
      });
      for (const stat of disciplineStats) {
        const accumulator = players.get(stat.playerId);
        if (accumulator) {
          accumulator.suspensions += stat.suspensionsServed;
        }
      }
    }

    const rawCards = this.buildRawCards([...players.values()], matchById);
    this.calculateRatings(rawCards);

    return {
      tournamentId,
      tournamentName: tournament.name,
      ratingVersion: 1,
      players: rawCards
        .map((card) => this.toDto(card))
        .sort(
          (left, right) =>
            right.ratings.ovr - left.ratings.ovr ||
            right.stats.goalContributions -
              left.stats.goalContributions ||
            left.name.localeCompare(right.name, 'ru'),
        ),
    };
  }

  private getOrCreateAccumulator(
    players: Map<number, PlayerCardAccumulator>,
    player: PlayerEntity,
  ): PlayerCardAccumulator {
    const existing = players.get(player.id);
    if (existing) return existing;

    const accumulator: PlayerCardAccumulator = {
      player,
      appearances: new Set<number>(),
      contributionsByMatch: new Map<number, number>(),
      goals: 0,
      assists: 0,
      yellowCards: 0,
      secondYellowCards: 0,
      redCards: 0,
      suspensions: 0,
    };
    players.set(player.id, accumulator);
    return accumulator;
  }

  private applyEvents(
    players: Map<number, PlayerCardAccumulator>,
    events: MatchEventEntity[],
  ): void {
    const goalTypes = new Set<MatchEventType>([
      MatchEventType.GOAL,
      MatchEventType.PENALTY_GOAL,
    ]);

    for (const event of events) {
      if (event.playerId && goalTypes.has(event.eventType)) {
        const accumulator = players.get(event.playerId);
        if (accumulator) {
          const goalValue = Math.max(1, event.goalValue ?? 1);
          accumulator.goals += goalValue;
          this.addContribution(accumulator, event.matchId, goalValue);
        }
      }

      if (event.assistPlayerId && goalTypes.has(event.eventType)) {
        const accumulator = players.get(event.assistPlayerId);
        if (accumulator) {
          accumulator.assists += 1;
          this.addContribution(accumulator, event.matchId, 1);
        }
      }

      if (!event.playerId) continue;
      const accumulator = players.get(event.playerId);
      if (!accumulator) continue;

      if (event.eventType === MatchEventType.YELLOW_CARD) {
        accumulator.yellowCards += 1;
      } else if (event.eventType === MatchEventType.SECOND_YELLOW_CARD) {
        accumulator.secondYellowCards += 1;
      } else if (event.eventType === MatchEventType.RED_CARD) {
        accumulator.redCards += 1;
      }
    }
  }

  private addContribution(
    accumulator: PlayerCardAccumulator,
    matchId: number,
    value: number,
  ): void {
    accumulator.contributionsByMatch.set(
      matchId,
      (accumulator.contributionsByMatch.get(matchId) ?? 0) + value,
    );
  }

  private buildRawCards(
    players: PlayerCardAccumulator[],
    matchById: Map<number, MatchEntity>,
  ): RawPlayerCard[] {
    const baseCards = players.map((accumulator) => {
      const positionKey: RawPlayerCard['positionKey'] =
        accumulator.latest?.position ??
        accumulator.player.position ??
        'unknown';
      const recentMatchIds = [...accumulator.appearances]
        .sort((left, right) =>
          this.compareMatches(matchById.get(right), matchById.get(left)),
        )
        .slice(0, 5);
      const recentGoalContributions = recentMatchIds.reduce(
        (sum, matchId) =>
          sum + (accumulator.contributionsByMatch.get(matchId) ?? 0),
        0,
      );
      const recentContributingMatches = recentMatchIds.filter(
        (matchId) => (accumulator.contributionsByMatch.get(matchId) ?? 0) > 0,
      ).length;

      return {
        accumulator,
        positionKey,
        matches: accumulator.appearances.size,
        recentMatchIds,
        recentGoalContributions,
        recentContributingMatches,
      };
    });

    return baseCards.map((card) => {
      const cohort = baseCards.filter(
        (candidate) => candidate.positionKey === card.positionKey,
      );
      const cohortMatches = cohort.reduce(
        (sum, candidate) => sum + candidate.matches,
        0,
      );
      const cohortRecentMatches = cohort.reduce(
        (sum, candidate) => sum + candidate.recentMatchIds.length,
        0,
      );
      const meanGoalsPerMatch = this.safeDivide(
        cohort.reduce(
          (sum, candidate) => sum + candidate.accumulator.goals,
          0,
        ),
        cohortMatches,
      );
      const meanAssistsPerMatch = this.safeDivide(
        cohort.reduce(
          (sum, candidate) => sum + candidate.accumulator.assists,
          0,
        ),
        cohortMatches,
      );
      const meanContributionsPerMatch =
        meanGoalsPerMatch + meanAssistsPerMatch;
      const meanRecentContributionsPerMatch = this.safeDivide(
        cohort.reduce(
          (sum, candidate) => sum + candidate.recentGoalContributions,
          0,
        ),
        cohortRecentMatches,
      );
      const meanRecentContributingShare = this.safeDivide(
        cohort.reduce(
          (sum, candidate) => sum + candidate.recentContributingMatches,
          0,
        ),
        cohortRecentMatches,
      );

      return {
        ...card,
        adjustedGoalsPerMatch: this.smoothedRate(
          card.accumulator.goals,
          card.matches,
          meanGoalsPerMatch,
          3,
        ),
        adjustedAssistsPerMatch: this.smoothedRate(
          card.accumulator.assists,
          card.matches,
          meanAssistsPerMatch,
          3,
        ),
        adjustedContributionsPerMatch: this.smoothedRate(
          card.accumulator.goals + card.accumulator.assists,
          card.matches,
          meanContributionsPerMatch,
          3,
        ),
        adjustedRecentContributionsPerMatch: this.smoothedRate(
          card.recentGoalContributions,
          card.recentMatchIds.length,
          meanRecentContributionsPerMatch,
          2,
        ),
        adjustedRecentContributingShare: this.smoothedRate(
          card.recentContributingMatches,
          card.recentMatchIds.length,
          meanRecentContributingShare,
          2,
        ),
      };
    });
  }

  private calculateRatings(cards: RawPlayerCard[]): void {
    const cohorts = new Map<RawPlayerCard['positionKey'], RawPlayerCard[]>();
    for (const card of cards) {
      const cohort = cohorts.get(card.positionKey) ?? [];
      cohort.push(card);
      cohorts.set(card.positionKey, cohort);
    }

    for (const cohort of cohorts.values()) {
      for (const card of cohort) {
        const rate = (
          value: number,
          selector: (candidate: RawPlayerCard) => number,
        ) =>
          this.toRelativeRating(
            value,
            cohort.map(selector),
          );
        const att = this.weightedRating(
          rate(
            card.adjustedGoalsPerMatch,
            (candidate) => candidate.adjustedGoalsPerMatch,
          ),
          rate(
            card.accumulator.goals,
            (candidate) => candidate.accumulator.goals,
          ),
          0.7,
        );
        const cre = this.weightedRating(
          rate(
            card.adjustedAssistsPerMatch,
            (candidate) => candidate.adjustedAssistsPerMatch,
          ),
          rate(
            card.accumulator.assists,
            (candidate) => candidate.accumulator.assists,
          ),
          0.7,
        );
        const imp = this.weightedRating(
          rate(
            card.adjustedContributionsPerMatch,
            (candidate) => candidate.adjustedContributionsPerMatch,
          ),
          rate(
            card.accumulator.goals + card.accumulator.assists,
            (candidate) =>
              candidate.accumulator.goals +
              candidate.accumulator.assists,
          ),
          0.7,
        );
        const form = this.weightedRating(
          rate(
            card.adjustedRecentContributionsPerMatch,
            (candidate) =>
              candidate.adjustedRecentContributionsPerMatch,
          ),
          rate(
            card.adjustedRecentContributingShare,
            (candidate) => candidate.adjustedRecentContributingShare,
          ),
          0.7,
        );
        const exp = rate(
          card.matches,
          (candidate) => candidate.matches,
        );
        const disc = Math.max(
          40,
          99 -
            card.accumulator.yellowCards * 2 -
            card.accumulator.secondYellowCards * 8 -
            card.accumulator.redCards * 15 -
            card.accumulator.suspensions * 5,
        );

        card.ratings = { att, cre, form, exp, disc, imp };
        const weights = POSITION_WEIGHTS[card.positionKey];
        card.provisionalOvr = Math.round(
          att * weights.att +
            cre * weights.cre +
            form * weights.form +
            exp * weights.exp +
            disc * weights.disc +
            imp * weights.imp,
        );
      }

    }
  }

  private toDto(card: RawPlayerCard): PlayerCardDto {
    const accumulator = card.accumulator;
    const ratings = card.ratings!;
    const team = accumulator.latest!.team;
    const goalsPerMatch = this.safeDivide(
      accumulator.goals,
      card.matches,
    );
    const assistsPerMatch = this.safeDivide(
      accumulator.assists,
      card.matches,
    );

    return {
      playerId: accumulator.player.id,
      name: [
        accumulator.player.firstName,
        accumulator.player.lastName,
      ]
        .filter(Boolean)
        .join(' '),
      photoUrl: accumulator.player.photoUrl ?? null,
      position: this.getPositionCode(card.positionKey),
      positionName: this.getPositionName(card.positionKey),
      team: {
        id: team.id,
        name: team.name,
        logoUrl: team.logoUrl ?? null,
      },
      shirtNumber: accumulator.latest?.shirtNumber ?? null,
      preferredFoot: accumulator.player.preferredFoot ?? null,
      preferredFootName: this.getPreferredFootName(
        accumulator.player.preferredFoot,
      ),
      hasLimitedData: card.matches < 3,
      ratings: {
        ovr: card.provisionalOvr ?? 70,
        ...ratings,
      },
      stats: {
        matches: card.matches,
        goals: accumulator.goals,
        assists: accumulator.assists,
        goalContributions: accumulator.goals + accumulator.assists,
        goalsPerMatch: this.roundRate(goalsPerMatch),
        assistsPerMatch: this.roundRate(assistsPerMatch),
        goalContributionsPerMatch: this.roundRate(
          goalsPerMatch + assistsPerMatch,
        ),
        recentGoalContributions: card.recentGoalContributions,
        yellowCards: accumulator.yellowCards,
        secondYellowCards: accumulator.secondYellowCards,
        redCards: accumulator.redCards,
        suspensions: accumulator.suspensions,
      },
    };
  }

  private isLaterMatch(
    candidate?: MatchEntity,
    current?: MatchEntity,
  ): boolean {
    return this.compareMatches(candidate, current) > 0;
  }

  private compareMatches(
    left?: MatchEntity,
    right?: MatchEntity,
  ): number {
    if (!left) return -1;
    if (!right) return 1;

    const leftTime = left.matchDatetime?.getTime() ?? 0;
    const rightTime = right.matchDatetime?.getTime() ?? 0;
    return leftTime - rightTime || left.id - right.id;
  }

  private smoothedRate(
    value: number,
    matches: number,
    cohortMean: number,
    priorMatches: number,
  ): number {
    return (value + cohortMean * priorMatches) / (matches + priorMatches);
  }

  private safeDivide(value: number, divisor: number): number {
    return divisor > 0 ? value / divisor : 0;
  }

  private weightedRating(
    primary: number,
    secondary: number,
    primaryWeight: number,
  ): number {
    return Math.round(
      primary * primaryWeight + secondary * (1 - primaryWeight),
    );
  }

  private toRelativeRating(value: number, cohortValues: number[]): number {
    if (cohortValues.length < 2) return 70;

    const sorted = [...cohortValues].sort((left, right) => left - right);
    const minimum = sorted[0];
    const maximum = sorted[sorted.length - 1];
    if (Math.abs(maximum - minimum) < Number.EPSILON) return 70;

    const tolerance = 1e-9;
    const firstIndex = sorted.findIndex(
      (candidate) => Math.abs(candidate - value) <= tolerance,
    );
    let lastIndex = firstIndex;
    while (
      lastIndex + 1 < sorted.length &&
      Math.abs(sorted[lastIndex + 1] - value) <= tolerance
    ) {
      lastIndex += 1;
    }
    const averageRank = (firstIndex + lastIndex) / 2;
    const percentile = averageRank / (sorted.length - 1);

    return Math.round(40 + percentile * 59);
  }

  private roundRate(value: number): number {
    return Number(value.toFixed(2));
  }

  private getPositionCode(
    position: PlayerPosition | 'unknown',
  ): PlayerCardPositionCode {
    const labels: Record<
      PlayerPosition | 'unknown',
      PlayerCardPositionCode
    > = {
      [PlayerPosition.GOALKEEPER]: 'GK',
      [PlayerPosition.DEFENDER]: 'DF',
      [PlayerPosition.WINGER]: 'MF',
      [PlayerPosition.FORWARD]: 'FW',
      unknown: '—',
    };
    return labels[position];
  }

  private getPositionName(position: PlayerPosition | 'unknown'): string {
    const labels: Record<PlayerPosition | 'unknown', string> = {
      [PlayerPosition.GOALKEEPER]: 'Вратарь',
      [PlayerPosition.DEFENDER]: 'Защитник',
      [PlayerPosition.WINGER]: 'Полузащитник',
      [PlayerPosition.FORWARD]: 'Нападающий',
      unknown: 'Позиция не указана',
    };
    return labels[position];
  }

  private getPreferredFootName(preferredFoot?: PreferredFoot): string {
    if (preferredFoot === PreferredFoot.LEFT) return 'Левая нога';
    if (preferredFoot === PreferredFoot.RIGHT) return 'Правая нога';
    if (preferredFoot === PreferredFoot.BOTH) return 'Обе ноги';
    return 'Нога не указана';
  }
}
