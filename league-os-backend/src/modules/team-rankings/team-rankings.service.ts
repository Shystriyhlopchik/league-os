import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CompetitionEntity } from '../competitions/entities/competitions.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { SeasonEntity } from '../seasons/entities/season.entity';
import { StandingEntity } from '../standings/entities/standing.entity';
import { TeamEntity } from '../teams/entities/team.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TeamRatingResult } from '../tournament-teams/enums/team-rating-result.enum';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentFormat } from '../tournaments/enums/tournament-format.enum';
import { TournamentLifecycleStatus } from '../tournaments/enums/tournament-lifecycle-status.enum';
import { TournamentStatus } from '../tournaments/enums/tournament-status.enum';
import {
  CURRENT_SEASON_WEIGHTS,
  TeamRankingCalculator,
} from './team-ranking.calculator';
import type {
  TeamRankingMode,
  TeamRankingResponse,
  TeamRankingRow,
  TeamSeasonRatingBreakdown,
  TournamentRatingBreakdown,
} from './types/team-ranking.type';

interface TeamMatchStats {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

const RESULT_ORDER: TeamRatingResult[] = [
  TeamRatingResult.CHAMPION,
  TeamRatingResult.FINALIST,
  TeamRatingResult.THIRD,
  TeamRatingResult.FOURTH,
  TeamRatingResult.PLAYOFF,
  TeamRatingResult.PARTICIPATION,
];

@Injectable()
export class TeamRankingsService {
  constructor(
    @InjectRepository(CompetitionEntity)
    private readonly competitionRepository: Repository<CompetitionEntity>,
    @InjectRepository(SeasonEntity)
    private readonly seasonRepository: Repository<SeasonEntity>,
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentTeamEntity)
    private readonly tournamentTeamRepository: Repository<TournamentTeamEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(StandingEntity)
    private readonly standingRepository: Repository<StandingEntity>,
    private readonly calculator: TeamRankingCalculator,
  ) {}

  getCurrent(competitionId: number): Promise<TeamRankingResponse> {
    return this.build(competitionId, 'current');
  }

  getHistorical(competitionId: number): Promise<TeamRankingResponse> {
    return this.build(competitionId, 'historical');
  }

  private async build(
    competitionId: number,
    mode: TeamRankingMode,
  ): Promise<TeamRankingResponse> {
    const competition = await this.competitionRepository.findOneBy({
      id: competitionId,
    });
    if (!competition) throw new NotFoundException('Competition not found');

    const seasons = this.sortSeasons(
      await this.seasonRepository.find({ where: { competitionId } }),
    );
    const seasonIds = seasons.map((season) => season.id);
    const tournaments = seasonIds.length
      ? await this.tournamentRepository.find({
          where: { seasonId: In(seasonIds) },
        })
      : [];
    const tournamentIds = tournaments.map((tournament) => tournament.id);
    const [tournamentTeams, matches, standings] = tournamentIds.length
      ? await Promise.all([
          this.tournamentTeamRepository.find({
            where: { tournamentId: In(tournamentIds) },
            relations: { team: true },
          }),
          this.matchRepository.find({
            where: {
              tournamentId: In(tournamentIds),
              status: MatchStatus.FINISHED,
            },
          }),
          this.standingRepository.find({
            where: { tournamentId: In(tournamentIds) },
            relations: { stage: true },
          }),
        ])
      : [[], [], []];

    const tournamentById = new Map(
      tournaments.map((tournament) => [tournament.id, tournament]),
    );
    const teamsByTournament = this.groupBy(
      tournamentTeams,
      (entry) => entry.tournamentId,
    );
    const matchesByTournament = this.groupBy(
      matches,
      (match) => match.tournamentId,
    );
    const standingsByTournament = this.groupBy(
      standings,
      (standing) => standing.tournamentId,
    );
    const tournamentTeamsBySeason = this.groupBy(
      tournamentTeams,
      (entry) => tournamentById.get(entry.tournamentId)?.seasonId ?? -1,
    );
    const ratedSeasons = seasons.filter(
      (season) => (tournamentTeamsBySeason.get(season.id)?.length ?? 0) > 0,
    );
    const teamById = new Map<number, TeamEntity>();
    tournamentTeams.forEach((entry) => teamById.set(entry.teamId, entry.team));

    const breakdownByTeam = new Map<number, TeamSeasonRatingBreakdown[]>();
    const lastSeasonIndex = new Map<number, number>();
    const loyaltyStreak = new Map<number, number>();

    ratedSeasons.forEach((season, seasonIndex) => {
      const entries = tournamentTeamsBySeason.get(season.id) ?? [];
      const entriesByTeam = this.groupBy(entries, (entry) => entry.teamId);

      entriesByTeam.forEach((teamEntries, teamId) => {
        const previousIndex = lastSeasonIndex.get(teamId);
        const streak =
          previousIndex === seasonIndex - 1
            ? (loyaltyStreak.get(teamId) ?? 0) + 1
            : 1;
        lastSeasonIndex.set(teamId, seasonIndex);
        loyaltyStreak.set(teamId, streak);

        const tournamentBreakdowns = teamEntries.map((entry) => {
          const tournament = tournamentById.get(
            entry.tournamentId,
          ) as TournamentEntity;
          return this.calculateTournamentBreakdown(
            entry,
            tournament,
            teamsByTournament.get(tournament.id) ?? [],
            matchesByTournament.get(tournament.id) ?? [],
            standingsByTournament.get(tournament.id) ?? [],
          );
        });
        const loyaltyBonus = this.calculator.loyaltyBonus(streak);
        const totals = this.sumTournamentStats(tournamentBreakdowns);
        const seasonPoints = this.calculator.round(
          tournamentBreakdowns.reduce(
            (sum, tournament) => sum + tournament.pointsBeforeLoyalty,
            0,
          ) + loyaltyBonus,
        );
        const breakdown: TeamSeasonRatingBreakdown = {
          season: {
            id: season.id,
            name: season.name,
            year: season.year,
          },
          loyaltyStreak: streak,
          loyaltyBonus,
          seasonPoints,
          weight: 1,
          weightedPoints: seasonPoints,
          ...totals,
          tournaments: tournamentBreakdowns,
        };
        const teamBreakdowns = breakdownByTeam.get(teamId) ?? [];
        teamBreakdowns.push(breakdown);
        breakdownByTeam.set(teamId, teamBreakdowns);
      });
    });

    const seasonWeights = this.seasonWeights(ratedSeasons, mode);
    const weightBySeason = new Map(
      seasonWeights.map((entry) => [entry.seasonId, entry.weight]),
    );
    const rankings = [...breakdownByTeam.entries()]
      .map(([teamId, breakdowns]) =>
        this.toRankingRow(
          teamById.get(teamId) as TeamEntity,
          breakdowns,
          weightBySeason,
          mode,
        ),
      )
      .filter((row): row is TeamRankingRow => row !== null)
      .sort(
        (left, right) =>
          right.points - left.points ||
          right.goalDifference - left.goalDifference ||
          right.goalsFor - left.goalsFor ||
          left.team.name.localeCompare(right.team.name, 'ru') ||
          left.team.id - right.team.id,
      )
      .map((row, index) => ({ ...row, position: index + 1 }));

    return {
      mode,
      generatedAt: new Date().toISOString(),
      competition: {
        id: competition.id,
        name: competition.name,
        slug: competition.slug,
      },
      seasonWeights,
      rankings,
    };
  }

  private calculateTournamentBreakdown(
    entry: TournamentTeamEntity,
    tournament: TournamentEntity,
    tournamentTeams: TournamentTeamEntity[],
    matches: MatchEntity[],
    standings: StandingEntity[],
  ): TournamentRatingBreakdown {
    const stats = this.matchStats(entry.teamId, matches);
    const result = this.ratingResult(entry, tournament, matches, standings);
    const calculation = this.calculator.calculate({
      ...stats,
      result,
      tournamentTeamCount: tournamentTeams.length,
      loyaltyStreak: 1,
    });

    return {
      tournament: { id: tournament.id, name: tournament.name },
      result,
      ...stats,
      performancePoints: calculation.performancePoints,
      placeBonus: calculation.placeBonus,
      tournamentCoefficient: calculation.tournamentCoefficient,
      pointsBeforeLoyalty: calculation.seasonPoints,
    };
  }

  private ratingResult(
    entry: TournamentTeamEntity,
    tournament: TournamentEntity,
    matches: MatchEntity[],
    standings: StandingEntity[],
  ): TeamRatingResult {
    if (entry.ratingResult) return entry.ratingResult;

    const final = this.lastMatchOfRound(matches, MatchRoundType.FINAL);
    if (final) {
      if (this.winner(final) === entry.teamId) return TeamRatingResult.CHAMPION;
      if (this.loser(final) === entry.teamId) return TeamRatingResult.FINALIST;
    }

    const thirdPlace = this.lastMatchOfRound(
      matches,
      MatchRoundType.THIRD_PLACE,
    );
    if (thirdPlace) {
      if (this.winner(thirdPlace) === entry.teamId)
        return TeamRatingResult.THIRD;
      if (this.loser(thirdPlace) === entry.teamId)
        return TeamRatingResult.FOURTH;
    } else if (
      final ||
      tournament.status === TournamentStatus.FINISHED ||
      tournament.lifecycleStatus === TournamentLifecycleStatus.COMPLETED
    ) {
      const semiFinalLosers = matches
        .filter(
          (match) =>
            this.roundType(match) === MatchRoundType.SEMI_FINAL &&
            this.loser(match) !== undefined,
        )
        .map((match) => this.loser(match) as number);
      const uniqueLosers = [...new Set(semiFinalLosers)];
      if (uniqueLosers.includes(entry.teamId)) {
        const rankedLosers = uniqueLosers.sort((left, right) => {
          const leftStats = this.matchStats(left, matches);
          const rightStats = this.matchStats(right, matches);
          return (
            rightStats.goalDifference - leftStats.goalDifference ||
            rightStats.goalsFor - leftStats.goalsFor ||
            left - right
          );
        });
        return rankedLosers.indexOf(entry.teamId) === 0
          ? TeamRatingResult.THIRD
          : TeamRatingResult.FOURTH;
      }
    }

    const standingResult = this.ratingResultFromStandings(
      entry.teamId,
      tournament,
      standings,
    );
    if (standingResult) return standingResult;

    const playedInPlayoff = matches.some(
      (match) =>
        (match.homeTeamId === entry.teamId ||
          match.awayTeamId === entry.teamId) &&
        this.isPlayoffRound(match),
    );
    return playedInPlayoff
      ? TeamRatingResult.PLAYOFF
      : TeamRatingResult.PARTICIPATION;
  }

  private ratingResultFromStandings(
    teamId: number,
    tournament: TournamentEntity,
    standings: StandingEntity[],
  ): TeamRatingResult | undefined {
    const completed =
      tournament.status === TournamentStatus.FINISHED ||
      tournament.lifecycleStatus === TournamentLifecycleStatus.COMPLETED;
    if (!completed || tournament.format !== TournamentFormat.ROUND_ROBIN) {
      return undefined;
    }
    const eligible = standings.filter(
      (standing) =>
        !standing.stageId ||
        standing.stage?.type === TournamentStageType.ROUND_ROBIN,
    );
    const legacy = eligible.filter((standing) => !standing.stageId);
    const row = (legacy.length ? legacy : eligible).find(
      (standing) => standing.teamId === teamId,
    );
    const results: Record<number, TeamRatingResult> = {
      1: TeamRatingResult.CHAMPION,
      2: TeamRatingResult.FINALIST,
      3: TeamRatingResult.THIRD,
      4: TeamRatingResult.FOURTH,
    };
    return row?.position ? results[row.position] : undefined;
  }

  private lastMatchOfRound(
    matches: MatchEntity[],
    roundType: MatchRoundType,
  ): MatchEntity | undefined {
    return matches
      .filter((match) => this.roundType(match) === roundType)
      .sort((left, right) => right.id - left.id)[0];
  }

  private roundType(match: MatchEntity): MatchRoundType | undefined {
    if (match.roundType) return match.roundType;
    const round = match.round?.trim().toLocaleLowerCase('ru') ?? '';
    if (/полуфин|semi.?final/.test(round)) return MatchRoundType.SEMI_FINAL;
    if (/3.*мест|third.?place/.test(round)) return MatchRoundType.THIRD_PLACE;
    if (/четвертьфин|quarter.?final/.test(round))
      return MatchRoundType.QUARTER_FINAL;
    if (/финал|\bfinal\b/.test(round)) return MatchRoundType.FINAL;
    if (/1\/16|round.?of.?32/.test(round)) return MatchRoundType.ROUND_OF_32;
    if (/1\/8|round.?of.?16/.test(round)) return MatchRoundType.ROUND_OF_16;
    return undefined;
  }

  private isPlayoffRound(match: MatchEntity): boolean {
    const roundType = this.roundType(match);
    if (
      roundType &&
      ![MatchRoundType.ROUND_ROBIN, MatchRoundType.GROUP_ROUND].includes(
        roundType,
      )
    ) {
      return true;
    }
    return /плей.?офф|play.?off/i.test(match.round ?? '');
  }

  private winner(match: MatchEntity): number | undefined {
    if (match.winnerTeamId) return match.winnerTeamId;
    if (match.homeScore === match.awayScore) return undefined;
    return match.homeScore > match.awayScore
      ? match.homeTeamId
      : match.awayTeamId;
  }

  private loser(match: MatchEntity): number | undefined {
    if (match.loserTeamId) return match.loserTeamId;
    const winner = this.winner(match);
    if (!winner) return undefined;
    return winner === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  }

  private matchStats(teamId: number, matches: MatchEntity[]): TeamMatchStats {
    const stats: TeamMatchStats = {
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
    };
    matches.forEach((match) => {
      const isHome = match.homeTeamId === teamId;
      const isAway = match.awayTeamId === teamId;
      if (!isHome && !isAway) return;
      const goalsFor = isHome ? match.homeScore : match.awayScore;
      const goalsAgainst = isHome ? match.awayScore : match.homeScore;
      stats.matchesPlayed += 1;
      stats.goalsFor += goalsFor;
      stats.goalsAgainst += goalsAgainst;
      if (goalsFor > goalsAgainst) stats.wins += 1;
      else if (goalsFor < goalsAgainst) stats.losses += 1;
      else stats.draws += 1;
    });
    stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
    return stats;
  }

  private sumTournamentStats(
    tournaments: TournamentRatingBreakdown[],
  ): TeamMatchStats {
    return tournaments.reduce<TeamMatchStats>(
      (sum, tournament) => ({
        matchesPlayed: sum.matchesPlayed + tournament.matchesPlayed,
        wins: sum.wins + tournament.wins,
        draws: sum.draws + tournament.draws,
        losses: sum.losses + tournament.losses,
        goalsFor: sum.goalsFor + tournament.goalsFor,
        goalsAgainst: sum.goalsAgainst + tournament.goalsAgainst,
        goalDifference: sum.goalDifference + tournament.goalDifference,
      }),
      {
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
      },
    );
  }

  private seasonWeights(
    seasons: SeasonEntity[],
    mode: TeamRankingMode,
  ): TeamRankingResponse['seasonWeights'] {
    const selected =
      mode === 'current'
        ? seasons.slice(-CURRENT_SEASON_WEIGHTS.length).reverse()
        : [...seasons].reverse();
    return selected.map((season, index) => ({
      seasonId: season.id,
      seasonName: season.name,
      seasonYear: season.year,
      weight: mode === 'current' ? CURRENT_SEASON_WEIGHTS[index] : 1,
    }));
  }

  private toRankingRow(
    team: TeamEntity,
    breakdowns: TeamSeasonRatingBreakdown[],
    weightBySeason: Map<number, number>,
    mode: TeamRankingMode,
  ): TeamRankingRow | null {
    const selected = breakdowns
      .filter(
        (breakdown) =>
          mode === 'historical' || weightBySeason.has(breakdown.season.id),
      )
      .map((breakdown) => {
        const weight = weightBySeason.get(breakdown.season.id) ?? 1;
        return {
          ...breakdown,
          weight,
          weightedPoints: this.calculator.round(
            breakdown.seasonPoints * weight,
          ),
        };
      })
      .sort((left, right) =>
        this.compareSeasonValues(right.season, left.season),
      );
    if (!selected.length) return null;

    return {
      position: 0,
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        logoUrl: team.logoUrl,
      },
      points: this.calculator.round(
        selected.reduce((sum, season) => sum + season.weightedPoints, 0),
      ),
      goalDifference: selected.reduce(
        (sum, season) => sum + season.goalDifference,
        0,
      ),
      goalsFor: selected.reduce((sum, season) => sum + season.goalsFor, 0),
      seasonsPlayed: selected.length,
      seasonBreakdown: selected,
    };
  }

  private sortSeasons(seasons: SeasonEntity[]): SeasonEntity[] {
    return [...seasons].sort((left, right) =>
      this.compareSeasonValues(left, right),
    );
  }

  private compareSeasonValues(
    left: Pick<SeasonEntity, 'id' | 'year' | 'startDate' | 'endDate'>,
    right: Pick<SeasonEntity, 'id' | 'year' | 'startDate' | 'endDate'>,
  ): number {
    return (
      (left.year ?? 0) - (right.year ?? 0) ||
      (left.startDate ?? left.endDate ?? '').localeCompare(
        right.startDate ?? right.endDate ?? '',
      ) ||
      left.id - right.id
    );
  }

  private groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    items.forEach((item) => {
      const key = keyOf(item);
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    });
    return groups;
  }
}
