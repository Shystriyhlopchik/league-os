import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, DeepPartial, In, IsNull, Repository } from 'typeorm';

import { BaseCrudService } from '../../common/base/base-crud.service';
import { MatchEventEntity } from '../match-events/entities/match-event.entity';
import { MatchEventType } from '../match-events/enums/match-event-type.enum';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import type { StageRulesV1 } from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../tournament-teams/enums/tournament-team-status.enum';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import type { RecalculateStageStandingsDto } from './dto/recalculate-stage-standings.dto';
import { StandingEntity } from './entities/standing.entity';
import { RuleDrivenStandingsEngine } from './rule-driven-standings.engine';
import type { CalculatedStandingRow } from './types/standings-engine.type';

const DISCIPLINARY_EVENT_TYPES = [
  MatchEventType.YELLOW_CARD,
  MatchEventType.SECOND_YELLOW_CARD,
  MatchEventType.RED_CARD,
];

export interface StandingView {
  position: number;
  team: { id: number; name: string; logoUrl?: string };
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  disciplinaryScore: number;
  tieBreakReason?: StandingEntity['tieBreakReason'];
  stageId?: number;
  groupId?: number;
  ruleVersionId?: number;
}

@Injectable()
export class StandingsService extends BaseCrudService<StandingEntity> {
  constructor(
    @InjectRepository(StandingEntity)
    private readonly standingsRepository: Repository<StandingEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchesRepository: Repository<MatchEntity>,
    @InjectRepository(TournamentStageEntity)
    private readonly stageRepository: Repository<TournamentStageEntity>,
    @InjectRepository(TournamentGroupEntity)
    private readonly groupRepository: Repository<TournamentGroupEntity>,
    @InjectRepository(TournamentStageParticipantEntity)
    private readonly participantRepository: Repository<TournamentStageParticipantEntity>,
    @InjectRepository(TournamentTeamEntity)
    private readonly tournamentTeamRepository: Repository<TournamentTeamEntity>,
    private readonly dataSource: DataSource,
    private readonly engine: RuleDrivenStandingsEngine,
  ) {
    super(standingsRepository, 'Standing row');
  }

  override create(dto: DeepPartial<StandingEntity>): Promise<StandingEntity> {
    dto.goalDifference =
      Number(dto.goalsFor ?? 0) - Number(dto.goalsAgainst ?? 0);
    return super.create(dto);
  }

  override updateOne(
    query: Partial<StandingEntity>,
    dto: DeepPartial<StandingEntity>,
  ): Promise<StandingEntity> {
    if (dto.goalsFor !== undefined || dto.goalsAgainst !== undefined) {
      dto.goalDifference =
        Number(dto.goalsFor ?? 0) - Number(dto.goalsAgainst ?? 0);
    }
    return super.updateOne(query, dto);
  }

  async getStageStandings(
    tournamentId: number,
    stageId: number,
    groupId?: number,
  ): Promise<StandingView[]> {
    const standings = await this.standingsRepository.find({
      where: {
        tournamentId,
        stageId,
        groupId: groupId ?? IsNull(),
      },
      relations: { team: true },
      order: { position: 'ASC', teamId: 'ASC' },
    });
    return standings.map((standing) => this.toView(standing));
  }

  async getLegacyTournamentStandings(
    tournamentId: number,
  ): Promise<StandingView[]> {
    const standings = await this.standingsRepository.find({
      where: { tournamentId, stageId: IsNull() },
      relations: { team: true },
      order: {
        points: 'DESC',
        goalDifference: 'DESC',
        goalsFor: 'DESC',
        teamId: 'ASC',
      },
    });
    return standings.map((standing, index) =>
      this.toView({ ...standing, position: index + 1 }),
    );
  }

  async recalculateStage(
    tournamentId: number,
    stageId: number,
    groupId: number | undefined,
    dto: RecalculateStageStandingsDto = {},
  ): Promise<StandingView[]> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const stages = manager.getRepository(TournamentStageEntity);
      const groups = manager.getRepository(TournamentGroupEntity);
      const participants = manager.getRepository(
        TournamentStageParticipantEntity,
      );
      const tournaments = manager.getRepository(TournamentEntity);
      const ruleVersions = manager.getRepository(TournamentRuleVersionEntity);
      const matches = manager.getRepository(MatchEntity);
      const events = manager.getRepository(MatchEventEntity);
      const standings = manager.getRepository(StandingEntity);

      const stage = await stages.findOne({
        where: { id: stageId, tournamentId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!stage) throw new NotFoundException('Tournament stage not found');
      if (stage.type === TournamentStageType.KNOCKOUT) {
        throw new BadRequestException(
          'Knockout matches cannot be calculated as a standings table',
        );
      }
      if (stage.type === TournamentStageType.GROUP_STAGE && !groupId) {
        throw new BadRequestException(
          'groupId is required for a group-stage standings table',
        );
      }
      if (groupId) {
        const group = await groups.findOne({
          where: { id: groupId, stageId },
        });
        if (!group) throw new NotFoundException('Tournament group not found');
      }

      const tournament = await tournaments.findOne({
        where: { id: tournamentId },
      });
      if (!tournament) throw new NotFoundException('Tournament not found');
      const ruleVersionId = dto.ruleVersionId ?? tournament.activeRuleVersionId;
      if (!ruleVersionId) {
        throw new ConflictException(
          'Tournament has no active rule version for standings calculation',
        );
      }
      const ruleVersion = await ruleVersions.findOne({
        where: { id: ruleVersionId, tournamentId },
      });
      if (!ruleVersion) throw new NotFoundException('Rule version not found');
      const stageRules = ruleVersion.config.stages.find(
        (candidate) => candidate.stageKey === stage.key,
      );
      this.assertStandingsRules(stage, stageRules);

      const participantRows = await participants.find({
        where: {
          stageId,
          ...(groupId ? { groupId } : {}),
        },
        relations: { tournamentTeam: { team: true } },
        order: { seedNumber: 'ASC', tournamentTeamId: 'ASC' },
      });
      const teamIds = participantRows.map(
        (participant) => participant.tournamentTeam.teamId,
      );
      if (new Set(teamIds).size !== teamIds.length) {
        throw new ConflictException('Stage contains duplicate teams');
      }

      const matchRows = await matches.find({
        where: {
          tournamentId,
          stageId,
          groupId: groupId ?? IsNull(),
          status: MatchStatus.FINISHED,
        },
        order: { id: 'ASC' },
      });
      const scopedMatches = matchRows.filter(
        (match) =>
          match.status === MatchStatus.FINISHED &&
          match.stageId === stageId &&
          (groupId ? match.groupId === groupId : !match.groupId),
      );
      const teamIdSet = new Set(teamIds);
      if (
        scopedMatches.some(
          (match) =>
            !teamIdSet.has(match.homeTeamId) ||
            !teamIdSet.has(match.awayTeamId),
        )
      ) {
        throw new ConflictException(
          'A standings match contains a team outside the stage or group',
        );
      }

      const disciplinaryEvents = scopedMatches.length
        ? await events.find({
            where: {
              matchId: In(scopedMatches.map((match) => match.id)),
              eventType: In(DISCIPLINARY_EVENT_TYPES),
              isCancelled: false,
            },
            order: { id: 'ASC' },
          })
        : [];
      const existing = await standings.find({
        where: { stageId, groupId: groupId ?? IsNull() },
      });
      const manualRanks = this.mergeResolutionRanks(
        existing,
        dto.manualDecisions,
        'manualDecisionRank',
        teamIdSet,
      );
      const drawRanks = this.mergeResolutionRanks(
        existing,
        dto.drawResults,
        'drawRank',
        teamIdSet,
      );

      const calculated = this.engine.calculate({
        teamIds,
        matches: scopedMatches,
        scoring: stageRules.scoring,
        tieBreakers: stageRules.standings.tieBreakers,
        disciplinaryEvents: disciplinaryEvents.map((event) => ({
          teamId: event.teamId,
          eventType: event.eventType as
            | 'yellow_card'
            | 'second_yellow_card'
            | 'red_card',
        })),
        disciplinaryWeights: stageRules.standings.disciplinaryScore,
        manualDecisionRanks: manualRanks,
        drawRanks,
        drawSeed:
          dto.drawSeed ?? ruleVersion.id * 100_000 + stageId + (groupId ?? 0),
      });

      await standings.delete({ stageId, groupId: groupId ?? IsNull() });
      await standings.save(
        calculated.map((row) =>
          standings.create({
            tournamentId,
            stageId,
            groupId,
            ruleVersionId: ruleVersion.id,
            teamId: row.teamId,
            position: row.position,
            played: row.played,
            wins: row.wins,
            draws: row.draws,
            losses: row.losses,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalDifference: row.goalDifference,
            points: row.points,
            disciplinaryScore: row.disciplinaryScore,
            manualDecisionRank: row.manualDecisionRank,
            drawRank: row.drawRank,
            tieBreakReason: row.tieBreakReason,
          }),
        ),
      );

      const teamById = new Map(
        participantRows.map((participant) => [
          participant.tournamentTeam.teamId,
          participant.tournamentTeam.team,
        ]),
      );
      return calculated.map((row) =>
        this.calculatedToView(
          row,
          teamById.get(row.teamId),
          stageId,
          groupId,
          ruleVersion.id,
        ),
      );
    });
  }

  async recalculateByTournament(
    tournamentId: number,
  ): Promise<StandingEntity[] | StandingView[]> {
    const stages = await this.stageRepository.find({
      where: { tournamentId },
      order: { order: 'ASC' },
    });
    if (stages.length > 0) {
      const result: StandingView[] = [];
      for (const stage of stages) {
        if (stage.type === TournamentStageType.KNOCKOUT) continue;
        if (stage.type === TournamentStageType.GROUP_STAGE) {
          const groups = await this.groupRepository.find({
            where: { stageId: stage.id },
            order: { order: 'ASC' },
          });
          for (const group of groups) {
            result.push(
              ...(await this.recalculateStage(
                tournamentId,
                stage.id,
                group.id,
              )),
            );
          }
        } else {
          result.push(
            ...(await this.recalculateStage(tournamentId, stage.id, undefined)),
          );
        }
      }
      return result;
    }
    return this.recalculateLegacyTournament(tournamentId);
  }

  private async recalculateLegacyTournament(
    tournamentId: number,
  ): Promise<StandingEntity[]> {
    const [matches, tournamentTeams] = await Promise.all([
      this.matchesRepository.find({
        where: {
          tournamentId,
          stageId: IsNull(),
          status: MatchStatus.FINISHED,
        },
      }),
      this.tournamentTeamRepository.find({
        where: { tournamentId, status: TournamentTeamStatus.ACTIVE },
      }),
    ]);
    const calculated = this.engine.calculate({
      teamIds: tournamentTeams.map((team) => team.teamId),
      matches,
      scoring: { win: 3, draw: 1, loss: 0 },
      tieBreakers: [
        { type: 'goal_difference', scope: 'all_matches' },
        { type: 'goals_for', scope: 'all_matches' },
        { type: 'draw' },
      ],
      drawSeed: tournamentId,
    });
    await this.standingsRepository.delete({
      tournamentId,
      stageId: IsNull(),
    });
    return this.standingsRepository.save(
      calculated.map((row) =>
        this.standingsRepository.create({
          ...row,
          tournamentId,
        }),
      ),
    );
  }

  private assertStandingsRules(
    stage: TournamentStageEntity,
    rules: StageRulesV1 | undefined,
  ): asserts rules is Exclude<StageRulesV1, { type: 'knockout' }> {
    if (!rules) {
      throw new ConflictException(`No rules found for stage ${stage.key}`);
    }
    if (rules.type === 'knockout' || rules.type !== String(stage.type)) {
      throw new ConflictException(
        'Stage rules are incompatible with standings',
      );
    }
  }

  private mergeResolutionRanks(
    existing: StandingEntity[],
    supplied: Array<{ teamId: number; rank: number }> | undefined,
    field: 'manualDecisionRank' | 'drawRank',
    validTeamIds: Set<number>,
  ): Map<number, number> {
    const result = new Map<number, number>();
    existing.forEach((standing) => {
      const value = standing[field];
      if (value !== undefined) result.set(standing.teamId, value);
    });
    const suppliedTeamIds = new Set<number>();
    const suppliedRanks = new Set<number>();
    supplied?.forEach((resolution) => {
      if (!validTeamIds.has(resolution.teamId)) {
        throw new BadRequestException(
          `Resolution team ${resolution.teamId} is outside the table`,
        );
      }
      if (
        suppliedTeamIds.has(resolution.teamId) ||
        suppliedRanks.has(resolution.rank)
      ) {
        throw new BadRequestException(
          'Resolution team ids and ranks must be unique',
        );
      }
      suppliedTeamIds.add(resolution.teamId);
      suppliedRanks.add(resolution.rank);
      result.set(resolution.teamId, resolution.rank);
    });
    return result;
  }

  private calculatedToView(
    row: CalculatedStandingRow,
    team: { id: number; name: string; logoUrl?: string } | undefined,
    stageId: number,
    groupId: number | undefined,
    ruleVersionId: number,
  ): StandingView {
    return {
      ...row,
      team: team ?? { id: row.teamId, name: `Team ${row.teamId}` },
      stageId,
      groupId,
      ruleVersionId,
    };
  }

  private toView(standing: StandingEntity): StandingView {
    return {
      position: standing.position ?? 0,
      team: {
        id: standing.teamId,
        name: standing.team?.name ?? `Team ${standing.teamId}`,
        logoUrl: standing.team?.logoUrl,
      },
      played: standing.played,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      goalsFor: standing.goalsFor,
      goalsAgainst: standing.goalsAgainst,
      goalDifference: standing.goalDifference,
      points: standing.points,
      disciplinaryScore: standing.disciplinaryScore,
      tieBreakReason: standing.tieBreakReason,
      stageId: standing.stageId,
      groupId: standing.groupId,
      ruleVersionId: standing.ruleVersionId,
    };
  }
}
