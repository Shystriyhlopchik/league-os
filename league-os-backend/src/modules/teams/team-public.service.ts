import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { TeamsService } from './teams.service';
import {
  TeamPublicQuery,
  TeamStatisticsQuery,
} from './dto/team-public-query.dto';
import { CommunityTeamEntity } from '../registrations/entities/registration.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchRosterPlayerEntity } from '../match-rosters/entities/match-roster-player.entity';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { VideoEntity } from '../videos/entities/video.entity';
import { StandingEntity } from '../standings/entities/standing.entity';
import { PlayerEntity } from '../players/entities/player.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { formatLocalDateTime } from '../matches/helper/formatLocalDateTime';

interface PlayerTotals {
  playerId: number;
  name: string;
  photoUrl: string | null;
  matches: number;
  goals: number;
  assists: number;
  yellowCards: number;
  secondYellowCards: number;
  redCards: number;
}

const identity = (p: PlayerEntity) => ({
  playerId: p.id,
  name: [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' '),
  photoUrl: p.photoUrl || null,
  position: p.position || null,
});

/** Public projections only: never serialize player accounts or administrative records. */
@Injectable()
export class TeamPublicService {
  constructor(
    private readonly db: DataSource,
    private readonly teams: TeamsService,
  ) {}

  private async context(teamId: number, query: TeamPublicQuery) {
    const team = await this.teams.findPublicById(teamId);
    const links = await this.db.getRepository(CommunityTeamEntity).find({
      where: { teamId, isActive: true, community: { isActive: true } },
      relations: { community: true },
      order: { communityId: 'ASC' },
    });
    const selected = query.communityId
      ? links.find((l) => l.communityId === query.communityId)
      : links.find((l) => l.community.isDefault) || links[0];
    if (!selected)
      throw new NotFoundException('Команда не найдена в сообществе');
    const communityId = selected.communityId;
    const entries = (
      await this.db.getRepository(TournamentTeamEntity).find({
        where: {
          teamId,
          tournament: { season: { competition: { communityId } } },
        },
        relations: { tournament: { season: { competition: true } } },
        order: { tournamentId: 'DESC' },
      })
    ).filter((e) => e.tournament.lifecycleStatus !== 'draft');
    return {
      team,
      entries,
      communityId,
      communities: links.map((l) => ({
        id: l.communityId,
        name: l.community.name,
      })),
    };
  }

  private async matches(teamId: number, tournamentIds: number[]) {
    if (!tournamentIds.length) return [];
    return this.db.getRepository(MatchEntity).find({
      where: [
        { tournamentId: In(tournamentIds), homeTeamId: teamId },
        { tournamentId: In(tournamentIds), awayTeamId: teamId },
      ],
      relations: { homeTeam: true, awayTeam: true, venue: true },
      order: { matchDatetime: 'DESC', id: 'DESC' },
    });
  }

  async overview(teamId: number, query: TeamPublicQuery) {
    const context = await this.context(teamId, query);
    const { entries, communityId } = context;
    const tournamentIds = entries.map((e) => e.tournamentId);
    const [matches, roster, standings] = await Promise.all([
      this.matches(teamId, tournamentIds),
      this.db.getRepository(TeamPlayerEntity).find({
        where: {
          teamId,
          communityId,
          isActive: true,
          player: { isActive: true },
        },
        relations: { player: true },
        order: { shirtNumber: 'ASC', id: 'ASC' },
      }),
      tournamentIds.length
        ? this.db.getRepository(StandingEntity).find({
            where: { teamId, tournamentId: In(tournamentIds) },
            relations: { stage: true, group: true },
          })
        : [],
    ]);
    const completedIds = matches
      .filter((m) => m.status === MatchStatus.FINISHED)
      .map((m) => m.id);
    const videos = completedIds.length
      ? await this.db.getRepository(VideoEntity).find({
          where: {
            communityId,
            status: 'published',
            matchId: In(completedIds),
          },
          order: { publishedAt: 'DESC', id: 'DESC' },
        })
      : [];
    const tournaments = entries.map((e) => ({
      id: e.tournamentId,
      name: e.tournament.name,
      seasonId: e.tournament.seasonId,
      seasonName: e.tournament.season.name,
      year: e.tournament.season.year ?? null,
      status: e.tournament.lifecycleStatus || e.tournament.status,
      ...this.achievement(e, matches, standings),
    }));
    const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));
    const teamSummary = (t: MatchEntity['homeTeam']) =>
      t ? { id: t.id, name: t.name, logoUrl: t.logoUrl || null } : null;
    return {
      team: context.team,
      communityId,
      communities: context.communities,
      tournaments,
      roster: roster.map((r) => ({
        ...identity(r.player),
        shirtNumber: r.shirtNumber ?? null,
        position: r.position || r.player.position || null,
        isCaptain: r.isCaptain,
      })),
      matches: matches.map((m) => ({
        id: m.id,
        tournamentId: m.tournamentId,
        tournamentName: tournamentMap.get(m.tournamentId)?.name,
        matchDatetime: formatLocalDateTime(m.matchDatetime) || null,
        round: m.round || null,
        status: m.status,
        homeTeam: teamSummary(m.homeTeam),
        awayTeam: teamSummary(m.awayTeam),
        homeScore: m.status === MatchStatus.SCHEDULED ? null : m.homeScore,
        awayScore: m.status === MatchStatus.SCHEDULED ? null : m.awayScore,
        winnerTeamId: m.winnerTeamId || null,
        venue: m.venue?.name || null,
      })),
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        coverUrl: v.coverUrl,
        embedUrl: v.embedUrl,
        publishedAt: v.publishedAt,
        matchId: v.matchId,
        tournamentId: v.tournamentId,
      })),
    };
  }

  private achievement(
    entry: TournamentTeamEntity,
    matches: MatchEntity[],
    standings: StandingEntity[],
  ) {
    const t = entry.tournament;
    const completed =
      t.lifecycleStatus === 'completed' || t.status === 'finished';
    let place: number | null = null;
    const places: Record<string, number> = {
      champion: 1,
      finalist: 2,
      third: 3,
      fourth: 4,
    };
    if (completed) {
      place = places[entry.ratingResult || ''] || null;
      if (!place && t.format === 'round_robin') {
        const row = standings.find(
          (s) =>
            s.tournamentId === t.id &&
            !s.groupId &&
            (!s.stageId || s.stage?.type === 'round_robin'),
        );
        place = row?.position || null;
      }
      if (!place) {
        // Do not invent a placing from a group table or an individual leg of a tie.
        for (const [round, winPlace, losePlace] of [
          ['final', 1, 2],
          ['third_place', 3, 4],
        ] as const) {
          const games = matches.filter(
            (m) =>
              m.tournamentId === t.id &&
              m.roundType === round &&
              m.status === 'finished',
          );
          if (games.length !== 1) continue;
          const m = games[0];
          const winner =
            m.winnerTeamId ||
            (m.homeScore !== m.awayScore
              ? m.homeScore > m.awayScore
                ? m.homeTeamId
                : m.awayTeamId
              : null);
          if (winner) place = winner === entry.teamId ? winPlace : losePlace;
        }
      }
    }
    return {
      completed,
      place,
      result: place
        ? `${place}-е место`
        : completed
          ? 'Итоговое место не зафиксировано'
          : 'Участие в турнире',
    };
  }

  async statistics(teamId: number, query: TeamStatisticsQuery) {
    const { entries, communityId } = await this.context(teamId, query);
    const data = await this.statisticData(teamId, entries, query);
    return {
      communityId,
      ...aggregateTeamStatistics(
        teamId,
        data.matches,
        data.rosters,
        data.events,
      ),
    };
  }

  private async statisticData(
    teamId: number,
    entries: TournamentTeamEntity[],
    query: TeamStatisticsQuery,
  ) {
    const selected = entries.filter(
      (e) =>
        (!query.seasonId || e.tournament.seasonId === query.seasonId) &&
        (!query.tournamentId || e.tournamentId === query.tournamentId),
    );
    const matches = (
      await this.matches(
        teamId,
        selected.map((e) => e.tournamentId),
      )
    ).filter(
      (m) =>
        m.status === MatchStatus.FINISHED &&
        (!query.year ||
          (formatLocalDateTime(m.matchDatetime) || '').slice(0, 4) ===
            String(query.year)),
    );
    const matchIds = matches.map((m) => m.id);
    const [rosters, events] = matchIds.length
      ? await Promise.all([
          this.db.getRepository(MatchRosterPlayerEntity).find({
            where: {
              wasAllowed: true,
              matchRoster: { teamId, matchId: In(matchIds), isApproved: true },
            },
            relations: { player: true, matchRoster: true },
          }),
          this.db.getRepository(MatchEventEntity).find({
            where: { teamId, matchId: In(matchIds), isCancelled: false },
            relations: { player: true, assistPlayer: true },
          }),
        ])
      : [[], []];
    return { matches, rosters, events };
  }

  async player(teamId: number, playerId: number, query: TeamPublicQuery) {
    const { team, communityId, entries } = await this.context(teamId, query);
    const link = await this.db.getRepository(TeamPlayerEntity).findOne({
      where: { teamId, playerId, communityId },
      relations: { player: true },
      order: { isActive: 'DESC', id: 'DESC' },
    });
    // A historical player may have no remaining team_players link. The match history is authoritative.
    const data = await this.statisticData(teamId, entries, {});
    const history = aggregateTeamStatistics(
      teamId,
      data.matches,
      data.rosters,
      data.events,
    );
    const historical = history.players.find((p) => p.playerId === playerId);
    if (!link && !historical)
      throw new NotFoundException('Игрок не найден в истории команды');
    const player = link ? identity(link.player) : historical!;
    const seasons = entries.map((e) => {
      const stats = aggregateTeamStatistics(
        teamId,
        data.matches.filter((m) => m.tournamentId === e.tournamentId),
        data.rosters,
        data.events,
      );
      const row = stats.players.find((p) => p.playerId === playerId);
      return row
        ? {
            tournamentId: e.tournamentId,
            tournamentName: e.tournament.name,
            seasonName: e.tournament.season.name,
            ...row,
          }
        : null;
    });
    return {
      team: { id: team.id, name: team.name },
      communityId,
      player: {
        ...player,
        position: link?.position || link?.player.position || null,
        shirtNumber: link?.isActive ? (link.shirtNumber ?? null) : null,
        isCurrent: link?.isActive === true && link.player.isActive,
      },
      totals: historical || {
        matches: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        secondYellowCards: 0,
        redCards: 0,
      },
      seasons: seasons.filter((s) => s !== null),
    };
  }
}

/** Statistics belong to (match, team, player), never to the player's current club. */
export function aggregateTeamStatistics(
  teamId: number,
  matches: MatchEntity[],
  rosters: MatchRosterPlayerEntity[],
  events: MatchEventEntity[],
) {
  const totals = {
    matches: matches.length,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };
  const byPlayer = new Map<
    number,
    PlayerTotals & { appearances: Set<number> }
  >();
  const get = (player: PlayerEntity, matchId: number) => {
    let p = byPlayer.get(player.id);
    if (!p) {
      p = {
        ...identity(player),
        matches: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        secondYellowCards: 0,
        redCards: 0,
        appearances: new Set(),
      };
      byPlayer.set(player.id, p);
    }
    p.appearances.add(matchId);
    return p;
  };
  const ids = new Set(matches.map((m) => m.id));
  for (const m of matches) {
    const home = m.homeTeamId === teamId;
    const scored = home ? m.homeScore : m.awayScore;
    const conceded = home ? m.awayScore : m.homeScore;
    totals.goalsFor += scored;
    totals.goalsAgainst += conceded;
    if (m.winnerTeamId)
      m.winnerTeamId === teamId ? totals.wins++ : totals.losses++;
    else if (scored === conceded) totals.draws++;
    else if (scored > conceded) totals.wins++;
    else totals.losses++;
  }
  for (const r of rosters) {
    if (
      r.wasAllowed &&
      r.matchRoster.teamId === teamId &&
      ids.has(r.matchRoster.matchId)
    )
      get(r.player, r.matchRoster.matchId);
  }
  for (const e of events) {
    if (e.isCancelled || e.teamId !== teamId || !ids.has(e.matchId)) continue;
    const goal =
      e.eventType === MatchEventType.GOAL ||
      e.eventType === MatchEventType.PENALTY_GOAL;
    if (e.player) {
      const p = get(e.player, e.matchId);
      if (goal) p.goals += Math.max(1, e.goalValue ?? 1);
      if (e.eventType === MatchEventType.YELLOW_CARD) p.yellowCards++;
      if (e.eventType === MatchEventType.SECOND_YELLOW_CARD) {
        p.yellowCards++;
        p.secondYellowCards++;
      }
      if (e.eventType === MatchEventType.RED_CARD) p.redCards++;
    }
    if (goal && e.assistPlayer) get(e.assistPlayer, e.matchId).assists++;
  }
  const players = [...byPlayer.values()]
    .map(({ appearances, ...p }) => ({ ...p, matches: appearances.size }))
    .sort(
      (a, b) =>
        b.goals - a.goals || b.assists - a.assists || a.playerId - b.playerId,
    );
  return { totals, players };
}
