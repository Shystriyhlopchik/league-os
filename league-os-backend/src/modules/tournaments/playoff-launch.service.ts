import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MatchEntity } from '../matches/entities/match.entity';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { StandingEntity } from '../standings/entities/standing.entity';
import { StandingsService } from '../standings/standings.service';
import { KnockoutBracketSnapshotEntity } from '../tournament-knockout-brackets/entities/knockout-bracket-snapshot.entity';
import { KnockoutBracketSnapshotStatus } from '../tournament-knockout-brackets/enums/knockout-bracket-snapshot-status.enum';
import { KnockoutBracketService } from '../tournament-knockout-brackets/knockout-bracket.service';
import { QualificationService } from '../tournament-qualifications/qualification.service';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import type { KnockoutStageRulesV1 } from '../tournament-rules/types/tournament-rules-config.type';
import { TournamentStageParticipantEntity } from '../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import { TournamentStageStatus } from '../tournament-stages/enums/tournament-stage-status.enum';
import { TournamentStageType } from '../tournament-stages/enums/tournament-stage-type.enum';
import { TournamentEntity } from './entities/tournaments.entity';
import { TournamentGroupEntity } from '../tournament-groups/entities/tournament-group.entity';
import { VenueEntity } from '../venues/entities/venue.entity';
import type { LaunchPlayoffDto } from './dto/launch-playoff.dto';

interface PlayoffStructure {
  tournament: TournamentEntity;
  groupStage: TournamentStageEntity;
  knockoutStage: TournamentStageEntity;
  knockoutRules: KnockoutStageRulesV1;
}

@Injectable()
export class PlayoffLaunchService {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentRepository: Repository<TournamentEntity>,
    @InjectRepository(TournamentStageEntity)
    private readonly stageRepository: Repository<TournamentStageEntity>,
    @InjectRepository(TournamentGroupEntity)
    private readonly groupRepository: Repository<TournamentGroupEntity>,
    @InjectRepository(TournamentStageParticipantEntity)
    private readonly participantRepository: Repository<TournamentStageParticipantEntity>,
    @InjectRepository(StandingEntity)
    private readonly standingRepository: Repository<StandingEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(VenueEntity)
    private readonly venueRepository: Repository<VenueEntity>,
    @InjectRepository(KnockoutBracketSnapshotEntity)
    private readonly bracketSnapshotRepository: Repository<KnockoutBracketSnapshotEntity>,
    private readonly standingsService: StandingsService,
    private readonly qualificationService: QualificationService,
    private readonly bracketService: KnockoutBracketService,
  ) {}

  async getState(tournamentId: number) {
    const structure = await this.loadStructure(tournamentId);
    const [groups, participants, standings, groupMatches, venues, bracket] =
      await Promise.all([
        this.groupRepository.find({
          where: { stageId: structure.groupStage.id },
          order: { order: 'ASC' },
        }),
        this.participantRepository.find({
          where: { stageId: structure.groupStage.id },
          relations: { tournamentTeam: { team: true } },
          order: { groupId: 'ASC', tournamentTeamId: 'ASC' },
        }),
        this.standingRepository.find({
          where: { stageId: structure.groupStage.id },
          order: { groupId: 'ASC', position: 'ASC', teamId: 'ASC' },
        }),
        this.matchRepository.find({
          where: { stageId: structure.groupStage.id },
          select: { id: true, status: true },
        }),
        this.venueRepository.find({
          where: { isActive: true },
          order: { name: 'ASC' },
        }),
        this.bracketSnapshotRepository.findOne({
          where: {
            tournamentId,
            stageId: structure.knockoutStage.id,
            status: KnockoutBracketSnapshotStatus.CONFIRMED,
            isCurrent: true,
          },
          relations: {
            plans: {
              match: { homeTeam: true, awayTeam: true, venue: true },
            },
          },
        }),
      ]);

    const participantByTeamId = new Map(
      participants.map((participant) => [
        participant.tournamentTeam.teamId,
        participant,
      ]),
    );
    const standingsReady =
      standings.length === participants.length &&
      standings.every(
        (row) =>
          row.ruleVersionId === structure.tournament.activeRuleVersionId &&
          row.position !== undefined,
      );
    const unfinishedMatches = groupMatches.filter(
      (match) =>
        match.status !== MatchStatus.FINISHED &&
        match.status !== MatchStatus.CANCELLED,
    ).length;
    const allGroupMatchesFinished =
      groupMatches.length > 0 && unfinishedMatches === 0;

    let suggestedTournamentTeamIds: number[] = [];
    let suggestionError: string | undefined;
    if (standingsReady && !bracket) {
      try {
        suggestedTournamentTeamIds = (
          await this.qualificationService.calculatePreview(
            tournamentId,
            structure.groupStage.id,
            structure.knockoutStage.id,
          )
        ).map((entry) => entry.tournamentTeamId);
      } catch (error) {
        suggestionError =
          error instanceof Error
            ? error.message
            : 'Не удалось автоматически определить участников плей-офф';
      }
    }

    return {
      tournament: {
        id: structure.tournament.id,
        name: structure.tournament.name,
      },
      groupStage: {
        id: structure.groupStage.id,
        name: structure.groupStage.name,
        allMatchesFinished: allGroupMatchesFinished,
        unfinishedMatches,
        standingsReady,
      },
      knockoutStage: {
        id: structure.knockoutStage.id,
        name: structure.knockoutStage.name,
        bracketSize: structure.knockoutRules.bracket.size,
        expectedMatches: this.expectedMatches(structure.knockoutRules),
      },
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        standings: standings
          .filter((row) => row.groupId === group.id)
          .map((row) => {
            const participant = participantByTeamId.get(row.teamId);
            return {
              tournamentTeamId: participant?.tournamentTeamId,
              team: participant
                ? {
                    id: participant.tournamentTeam.team.id,
                    name: participant.tournamentTeam.team.name,
                    logoUrl: participant.tournamentTeam.team.logoUrl,
                  }
                : { id: row.teamId, name: `Команда ${row.teamId}` },
              position: row.position,
              played: row.played,
              wins: row.wins,
              draws: row.draws,
              losses: row.losses,
              goalsFor: row.goalsFor,
              goalsAgainst: row.goalsAgainst,
              goalDifference: row.goalDifference,
              points: row.points,
            };
          }),
      })),
      suggestedTournamentTeamIds,
      suggestionError,
      venues: venues.map((venue) => ({
        id: venue.id,
        name: venue.name,
        address: venue.address,
      })),
      launched: Boolean(bracket),
      matches:
        bracket?.plans
          ?.sort((left, right) => left.order - right.order)
          .map((plan) => ({
            id: plan.match?.id,
            bracketPosition: plan.bracketPosition,
            homeTeamName: plan.match?.homeTeam?.name,
            awayTeamName: plan.match?.awayTeam?.name,
            matchDatetime: plan.match?.matchDatetime,
            venueName: plan.match?.venue?.name,
          })) ?? [],
    };
  }

  async prepare(tournamentId: number) {
    const structure = await this.loadStructure(tournamentId);
    const [groups, matches] = await Promise.all([
      this.groupRepository.find({
        where: { stageId: structure.groupStage.id },
        order: { order: 'ASC' },
      }),
      this.matchRepository.find({
        where: { stageId: structure.groupStage.id },
        select: { id: true, status: true },
      }),
    ]);
    if (groups.length === 0 || matches.length === 0) {
      throw new ConflictException('Group stage has no groups or matches');
    }
    const unfinished = matches.filter(
      (match) =>
        match.status !== MatchStatus.FINISHED &&
        match.status !== MatchStatus.CANCELLED,
    );
    if (unfinished.length > 0) {
      throw new ConflictException(
        `Finish or cancel ${unfinished.length} group-stage matches before launching the playoffs`,
      );
    }
    for (const group of groups) {
      await this.standingsService.recalculateStage(
        tournamentId,
        structure.groupStage.id,
        group.id,
        { ruleVersionId: structure.tournament.activeRuleVersionId },
      );
    }
    return this.getState(tournamentId);
  }

  async launch(tournamentId: number, dto: LaunchPlayoffDto, userId: number) {
    const structure = await this.loadStructure(tournamentId);
    const state = await this.getState(tournamentId);
    if (state.launched) {
      throw new ConflictException(
        'The playoff bracket has already been launched',
      );
    }
    if (
      !state.groupStage.allMatchesFinished ||
      !state.groupStage.standingsReady
    ) {
      throw new ConflictException(
        'Recalculate the completed group-stage standings before launch',
      );
    }
    const bracketSize = structure.knockoutRules.bracket.size;
    if (dto.selectedTournamentTeamIds.length !== bracketSize) {
      throw new BadRequestException(
        `Select exactly ${bracketSize} playoff teams`,
      );
    }
    const availableIds = new Set(
      state.groups.flatMap((group) =>
        group.standings.map((row) => row.tournamentTeamId),
      ),
    );
    if (
      dto.selectedTournamentTeamIds.some(
        (tournamentTeamId) => !availableIds.has(tournamentTeamId),
      )
    ) {
      throw new BadRequestException(
        'Every selected team must belong to the completed group stage',
      );
    }
    const pairedIds = dto.manualPairs.flatMap((pair) => [
      pair.homeTournamentTeamId,
      pair.awayTournamentTeamId,
    ]);
    if (
      dto.manualPairs.length !== bracketSize / 2 ||
      pairedIds.length !== bracketSize ||
      new Set(pairedIds).size !== bracketSize ||
      dto.selectedTournamentTeamIds.some((id) => !pairedIds.includes(id))
    ) {
      throw new BadRequestException(
        'Every selected team must appear in exactly one semifinal pair',
      );
    }

    const qualificationPreview = await this.qualificationService.preview(
      tournamentId,
      structure.groupStage.id,
      structure.knockoutStage.id,
      {
        ruleVersionId: structure.tournament.activeRuleVersionId,
        selectedTournamentTeamIds: dto.selectedTournamentTeamIds,
      },
      userId,
    );
    await this.qualificationService.confirm(
      tournamentId,
      qualificationPreview.id,
      { replaceCurrent: true },
      userId,
    );
    const bracketPreview = await this.bracketService.preview(
      tournamentId,
      structure.knockoutStage.id,
      { manualPairs: dto.manualPairs },
      userId,
    );
    await this.bracketService.confirm(
      tournamentId,
      bracketPreview.id,
      { schedule: dto.schedule },
      userId,
    );
    await this.stageRepository.update(structure.groupStage.id, {
      status: TournamentStageStatus.COMPLETED,
    });
    await this.stageRepository.update(structure.knockoutStage.id, {
      status: TournamentStageStatus.ACTIVE,
    });
    return this.getState(tournamentId);
  }

  private async loadStructure(tournamentId: number): Promise<PlayoffStructure> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (!tournament.activeRuleVersionId) {
      throw new ConflictException('Tournament has no published rule version');
    }
    const [stages, ruleVersion] = await Promise.all([
      this.stageRepository.find({
        where: { tournamentId },
        order: { order: 'ASC' },
      }),
      this.tournamentRepository.manager
        .getRepository(TournamentRuleVersionEntity)
        .findOneBy({ id: tournament.activeRuleVersionId, tournamentId }),
    ]);
    if (!ruleVersion) throw new NotFoundException('Rule version not found');
    const groupStage = stages.find(
      (stage) => stage.type === TournamentStageType.GROUP_STAGE,
    );
    const knockoutStage = stages.find(
      (stage) =>
        stage.type === TournamentStageType.KNOCKOUT &&
        (!groupStage || stage.order > groupStage.order),
    );
    if (!groupStage || !knockoutStage) {
      throw new ConflictException(
        'Tournament requires a group stage followed by a knockout stage',
      );
    }
    const knockoutRules = ruleVersion.config.stages.find(
      (stage): stage is KnockoutStageRulesV1 =>
        stage.stageKey === knockoutStage.key && stage.type === 'knockout',
    );
    if (!knockoutRules) {
      throw new ConflictException('Published rules have no knockout bracket');
    }
    if (knockoutRules.bracket.size !== 4) {
      throw new ConflictException(
        'The playoff launch screen currently supports four-team semifinals',
      );
    }
    return { tournament, groupStage, knockoutStage, knockoutRules };
  }

  private expectedMatches(rules: KnockoutStageRulesV1) {
    return [
      { bracketPosition: 'SF-1', label: 'Полуфинал 1' },
      { bracketPosition: 'SF-2', label: 'Полуфинал 2' },
      ...(rules.bracket.placementMatch === 'third_place'
        ? [
            {
              bracketPosition: 'THIRD_PLACE',
              label: 'Матч за третье место',
            },
          ]
        : []),
      { bracketPosition: 'FINAL', label: 'Финал' },
    ];
  }
}
