import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, MoreThanOrEqual, Not } from 'typeorm';
import { MatchEntity } from '../matches/entities/match.entity';
import { MatchRoundType } from '../matches/enums/match-round-type.enum';
import { MatchStatus } from '../matches/enums/match-status.enum';
import { TournamentRuleVersionEntity } from '../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentRuleVersionStatus } from '../tournament-rules/enums/tournament-rule-version-status.enum';
import { TournamentStageEntity } from '../tournament-stages/entities/tournament-stage.entity';
import {
  APPLICATION_LOCK_ROUND,
  APPLICATIONS_LOCKED_MESSAGE,
  ApplicationEditWindow,
  applicationEditWindow,
} from './application-edit-window';
import { CommunityActor } from '../communities/communities.service';
import { TournamentEntity } from '../tournaments/entities/tournaments.entity';
import { TournamentLifecycleStatus } from '../tournaments/enums/tournament-lifecycle-status.enum';
import { TournamentAccessService } from '../tournaments/access/tournament-access.service';
import { TournamentAccessAction } from '../tournaments/access/tournament-access-action.enum';
import { TeamPlayerEntity } from '../team-players/entities/team-players.entity';
import { TournamentTeamEntity } from '../tournament-teams/entities/tournament-teams.entity';
import { TournamentTeamStatus } from '../tournament-teams/enums/tournament-team-status.enum';
import { TournamentMemberEntity } from '../tournament-members/entities/tournament-member.entity';
import { CommunitySquadsService } from './community-squads.service';
import {
  ApplicationEventEntity,
  ApplicationRevisionEntity,
  ApplicationSnapshot,
  DEFAULT_REGISTRATION_POLICY,
  RegistrationPolicy,
  TournamentApplicationEntity,
  TournamentRosterPlayerEntity,
} from './entities/registration.entity';
import {
  RegistrationPolicyDto,
  ReviewApplicationDto,
  SaveApplicationDto,
} from './registration.dto';

@Injectable()
export class TournamentApplicationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly squads: CommunitySquadsService,
    private readonly access: TournamentAccessService,
  ) {}

  async tournament(id: number, manager = this.dataSource.manager) {
    const tournament = await manager.findOne(TournamentEntity, {
      where: { id, isActive: true },
      relations: { season: { competition: { community: true } } },
    });
    if (!tournament?.season.competition.community.isActive)
      throw new NotFoundException('Турнир не найден');
    return tournament;
  }
  communityId(tournament: TournamentEntity) {
    return tournament.season.competition.communityId;
  }
  policy(tournament: TournamentEntity): RegistrationPolicy {
    return tournament.registrationPolicy ?? { ...DEFAULT_REGISTRATION_POLICY };
  }

  async workspace(actor: CommunityActor) {
    const teams = await this.squads.myTeams(actor);
    const tournaments = await this.dataSource
      .getRepository(TournamentEntity)
      .find({
        where: { registrationRequired: true, isActive: true },
        relations: { season: { competition: { community: true } } },
        order: { id: 'DESC' },
      });
    const visible: {
      id: number;
      name: string;
      communityId: number;
      registrationStatus: string;
      canReview: boolean;
    }[] = [];
    for (const t of tournaments) {
      if (!t.season.competition.community.isActive) continue;
      const canReview = await this.canReview(t.id, actor);
      const hasTeam = teams.some(
        (team) => team.communityId === this.communityId(t),
      );
      if (canReview || (hasTeam && t.registrationStatus !== 'not_open'))
        visible.push({
          id: t.id,
          name: t.name,
          communityId: this.communityId(t),
          registrationStatus: t.registrationStatus,
          canReview,
        });
    }
    return { teams, tournaments: visible };
  }

  async canReview(id: number, actor: CommunityActor) {
    try {
      await this.access.assertAccess(
        id,
        actor,
        TournamentAccessAction.REVIEW_APPLICATIONS,
      );
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  async lock(manager: EntityManager, id: number) {
    const tournament = await this.tournament(id, manager);
    await this.squads.lockCommunity(manager, this.communityId(tournament));
    await manager.findOneOrFail(TournamentEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return this.tournament(id, manager);
  }

  async configure(
    id: number,
    dto: RegistrationPolicyDto,
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const tournament = await this.lock(manager, id);
      await this.access.assertAccess(id, actor, TournamentAccessAction.PUBLISH);
      if (
        !tournament.registrationRequired ||
        tournament.lifecycleStatus !== TournamentLifecycleStatus.DRAFT ||
        (await manager.exists(MatchEntity, {
          where: {
            tournamentId: id,
            status: In([MatchStatus.LIVE, MatchStatus.FINISHED]),
          },
        }))
      )
        throw new ConflictException(
          'Первоначальные настройки заявки можно менять только до запуска турнира',
        );
      if (
        dto.minPlayers > dto.maxPlayers ||
        dto.minMatchPlayers > dto.maxMatchPlayers ||
        dto.maxMatchPlayers > dto.maxPlayers ||
        dto.minMatchPlayers > dto.minPlayers
      )
        throw new BadRequestException(
          'Проверьте минимальное и максимальное число игроков',
        );
      const deadline = dto.deadline ? new Date(dto.deadline).getTime() : null;
      const previousDeadline = this.policy(tournament).deadline;
      if (
        deadline !== null &&
        deadline <= Date.now() &&
        deadline !==
          (previousDeadline ? new Date(previousDeadline).getTime() : null)
      )
        throw new BadRequestException('Срок регистрации должен быть в будущем');
      await this.assertPolicyCompatible(manager, tournament, dto);
      tournament.registrationPolicy = {
        ...dto,
        version: 1,
        deadline: dto.deadline ?? null,
      };
      return manager.save(tournament);
    });
  }

  private async assertPolicyCompatible(
    manager: EntityManager,
    tournament: TournamentEntity,
    policy: RegistrationPolicyDto,
  ) {
    const applications = await manager.find(TournamentApplicationEntity, {
      where: { tournamentId: tournament.id },
      relations: { team: true },
    });
    // Keep the accepted version protected even if its amendment is a draft or
    // has been returned. Incomplete, unaccepted drafts may be corrected later.
    const protectedVersions = applications.flatMap((app) => [
      ...(app.approvedRevisionId
        ? [{ app, revisionId: app.approvedRevisionId, kind: 'approved' }]
        : []),
      ...(app.status === 'submitted' &&
      app.currentRevisionId &&
      app.currentRevisionId !== app.approvedRevisionId
        ? [{ app, revisionId: app.currentRevisionId, kind: 'submitted' }]
        : []),
    ]);
    if (!protectedVersions.length) return;
    const revisions = await manager.find(ApplicationRevisionEntity, {
      where: {
        id: In([...new Set(protectedVersions.map((v) => v.revisionId))]),
      },
    });
    const byId = new Map(revisions.map((revision) => [revision.id, revision]));
    const conflicts: {
      applicationId: number;
      teamId: number;
      revisionId: number;
      message: string;
    }[] = [];
    for (const { app, revisionId, kind } of protectedVersions) {
      const revision = byId.get(revisionId);
      if (!revision || revision.applicationId !== app.id)
        throw new ConflictException(
          'Не удалось проверить сохранённые заявки. Обновите страницу или обратитесь к администратору.',
        );
      const players = revision.snapshot.players.length;
      const representatives = revision.snapshot.representatives.length;
      if (
        players >= policy.minPlayers &&
        players <= policy.maxPlayers &&
        representatives <= policy.maxRepresentatives
      )
        continue;
      const team = app.team?.name || `Команда №${app.teamId}`;
      conflicts.push({
        applicationId: app.id,
        teamId: app.teamId,
        revisionId,
        message: `${team}: ${kind === 'approved' ? 'утверждённая' : 'отправленная'} заявка — ${players} игроков, ${representatives} представителей`,
      });
    }
    if (conflicts.length)
      throw new ConflictException({
        code: 'REGISTRATION_POLICY_CONFLICT',
        message: `Новые лимиты несовместимы с существующими заявками (${conflicts.length}). ${conflicts
          .slice(0, 5)
          .map((c) => c.message)
          .join(
            '; ',
          )}. Сначала согласуйте исправленные составы или верните отправленные заявки на доработку.`,
        conflicts,
      });
  }

  async registration(
    id: number,
    action: 'open' | 'close',
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const tournament = await this.lock(manager, id);
      await this.access.assertAccess(id, actor, TournamentAccessAction.PUBLISH);
      if (
        !tournament.registrationRequired ||
        tournament.lifecycleStatus !== TournamentLifecycleStatus.DRAFT
      )
        throw new ConflictException(
          'Регистрацией можно управлять только до запуска турнира',
        );
      if (action === 'close' && tournament.registrationStatus !== 'open')
        throw new ConflictException('Регистрация ещё не открыта');
      if (action === 'open') {
        if (
          !(await manager.exists(TournamentRuleVersionEntity, {
            where: {
              tournamentId: id,
              status: TournamentRuleVersionStatus.DRAFT,
            },
          })) ||
          !(await manager.exists(TournamentStageEntity, {
            where: { tournamentId: id },
          }))
        )
          throw new ConflictException(
            'Сначала сохраните структуру и правила турнира в конструкторе',
          );
        if (
          await manager.exists(MatchEntity, {
            where: { tournamentId: id, status: Not(MatchStatus.CANCELLED) },
          })
        )
          throw new ConflictException(
            'Календарь уже сформирован. Повторное открытие набора команд недоступно',
          );
      }
      const policy = this.policy(tournament);
      if (
        action === 'open' &&
        policy.deadline &&
        new Date(policy.deadline).getTime() <= Date.now()
      )
        throw new ConflictException('Срок регистрации истёк');
      tournament.registrationStatus = action === 'open' ? 'open' : 'closed';
      tournament.registrationPolicy = policy;
      if (action === 'open') tournament.registrationOpenedAt ??= new Date();
      return manager.save(tournament);
    });
  }

  async detail(id: number, teamId: number, actor: CommunityActor) {
    const tournament = await this.tournament(id);
    const canReview = await this.canReview(id, actor);
    if (!canReview)
      await this.squads.assertManage(
        this.communityId(tournament),
        teamId,
        actor,
      );
    const application = await this.dataSource.manager.findOne(
      TournamentApplicationEntity,
      { where: { tournamentId: id, teamId }, relations: { team: true } },
    );
    const revisions = application
      ? await this.dataSource.manager.find(ApplicationRevisionEntity, {
          where: { applicationId: application.id },
          order: { version: 'DESC' },
        })
      : [];
    const events = application
      ? await this.dataSource.manager.find(ApplicationEventEntity, {
          where: { applicationId: application.id },
          order: { id: 'ASC' },
        })
      : [];
    const window = await this.editWindow(tournament);
    const reason = this.editBlockedReason(tournament, application, window);
    return {
      tournament,
      policy: this.policy(tournament),
      application,
      revisions,
      events,
      canReview,
      editing: { ...window, canEdit: reason === null, reason },
    };
  }

  async settings(id: number, actor: CommunityActor) {
    const tournament = await this.tournament(id);
    await this.access.assertAccess(id, actor, TournamentAccessAction.READ);
    let canManageMembers = false;
    try {
      await this.access.assertAccess(
        id,
        actor,
        TournamentAccessAction.MANAGE_MEMBERS,
      );
      canManageMembers = true;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
    return {
      tournament,
      policy: this.policy(tournament),
      communityId: this.communityId(tournament),
      canReview: await this.canReview(id, actor),
      canManageMembers,
    };
  }

  async list(id: number, actor: CommunityActor) {
    await this.access.assertAccess(
      id,
      actor,
      TournamentAccessAction.REVIEW_APPLICATIONS,
    );
    return this.dataSource.manager.find(TournamentApplicationEntity, {
      where: { tournamentId: id },
      relations: { team: true },
      order: { id: 'ASC' },
    });
  }

  async members(id: number, actor: CommunityActor) {
    await this.access.assertAccess(id, actor, TournamentAccessAction.READ);
    return this.dataSource.manager.find(TournamentMemberEntity, {
      where: { tournamentId: id },
      relations: { user: true },
      select: {
        id: true,
        userId: true,
        role: true,
        user: { id: true, username: true, firstName: true, lastName: true },
      },
      order: { id: 'ASC' },
    });
  }

  async editWindow(t: TournamentEntity, manager = this.dataSource.manager) {
    if (!t.registrationRequired) return applicationEditWindow([]);
    const matches = await manager.find(MatchEntity, {
      where: {
        tournamentId: t.id,
        roundNumber: MoreThanOrEqual(APPLICATION_LOCK_ROUND),
        roundType: In([MatchRoundType.GROUP_ROUND, MatchRoundType.ROUND_ROBIN]),
        status: Not(MatchStatus.CANCELLED),
      },
      select: {
        roundNumber: true,
        roundType: true,
        status: true,
        matchDatetime: true,
      },
    });
    return applicationEditWindow(matches);
  }

  editBlockedReason(
    t: TournamentEntity,
    app: TournamentApplicationEntity | null,
    window: ApplicationEditWindow,
  ): string | null {
    if (
      !t.registrationRequired ||
      t.lifecycleStatus === TournamentLifecycleStatus.COMPLETED
    )
      return 'Приём заявок недоступен';
    if (window.locked) return APPLICATIONS_LOCKED_MESSAGE;
    const policy = this.policy(t);
    if (app?.approvedRevisionId) {
      if (!policy.allowAmendments)
        return 'Изменения утверждённой заявки запрещены регламентом';
    } else if (t.registrationStatus !== 'open') return 'Регистрация закрыта';
    if (t.registrationStatus === 'not_open')
      return 'Регистрация ещё не открыта';
    if (
      !app?.approvedRevisionId &&
      policy.deadline &&
      new Date(policy.deadline).getTime() <=
        new Date(window.serverNow).getTime()
    )
      return 'Срок подачи первоначальной заявки истёк';
    if (app?.status === 'submitted')
      return 'Заявка на рассмотрении. Дождитесь решения администратора';
    return null;
  }

  assertWritable(
    t: TournamentEntity,
    app: TournamentApplicationEntity | null,
    window: ApplicationEditWindow,
  ) {
    const reason = this.editBlockedReason(t, app, window);
    if (reason) throw new ConflictException(reason);
  }

  async save(
    id: number,
    teamId: number,
    dto: SaveApplicationDto,
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const tournament = await this.lock(manager, id);
      const communityId = this.communityId(tournament);
      await this.squads.assertManage(communityId, teamId, actor, manager);
      const teamLink = await this.squads.assertTeam(
        communityId,
        teamId,
        manager,
      );
      if (teamLink.team.profileStatus !== 'published')
        throw new ConflictException(
          'Сначала заполните и опубликуйте карточку команды в кабинете команды',
        );
      let app = await manager.findOneBy(TournamentApplicationEntity, {
        tournamentId: id,
        teamId,
      });
      this.assertWritable(
        tournament,
        app,
        await this.editWindow(tournament, manager),
      );
      if ((app?.currentRevisionId ?? undefined) !== dto.expectedRevisionId)
        throw new ConflictException(
          'Заявка изменена в другом окне. Обновите страницу',
        );
      const policy = this.policy(tournament);
      const representatives = dto.representatives.map((r) => ({
        name: r.name.trim(),
      }));
      if (
        representatives.some((r) => !r.name) ||
        new Set(representatives.map((r) => r.name.toLocaleLowerCase('ru')))
          .size !== representatives.length
      )
        throw new BadRequestException('Проверьте ФИО представителей и повторы');
      if (
        dto.playerIds.length > policy.maxPlayers ||
        representatives.length > policy.maxRepresentatives
      )
        throw new BadRequestException(
          'Превышен лимит игроков или представителей',
        );
      const links = dto.playerIds.length
        ? await manager.find(TeamPlayerEntity, {
            where: {
              communityId,
              teamId,
              playerId: In(dto.playerIds),
              isActive: true,
            },
            relations: { player: true },
          })
        : [];
      if (
        links.length !== dto.playerIds.length ||
        links.some((link) => !link.player.isActive)
      )
        throw new BadRequestException(
          'Выбирайте действующих игроков текущего состава команды',
        );
      if (!app)
        app = await manager.save(TournamentApplicationEntity, {
          tournamentId: id,
          teamId,
          status: 'draft',
        });
      const previous = app.currentRevisionId
        ? await manager.findOneByOrFail(ApplicationRevisionEntity, {
            id: app.currentRevisionId,
          })
        : null;
      const snapshot: ApplicationSnapshot = {
        players: links.map((link) => ({
          playerId: link.playerId,
          teamPlayerId: link.id,
          shirtNumber: link.shirtNumber,
          position: link.position,
          isCaptain: link.isCaptain,
          name: [
            link.player.lastName,
            link.player.firstName,
            link.player.middleName,
          ]
            .filter(Boolean)
            .join(' '),
        })),
        representatives,
      };
      const revision = await manager.save(ApplicationRevisionEntity, {
        applicationId: app.id,
        version: (previous?.version ?? 0) + 1,
        createdByUserId: actor.id,
        policy,
        snapshot,
      });
      app.currentRevisionId = revision.id;
      app.status = 'draft';
      await manager.save(TournamentApplicationEntity, app);
      await this.event(manager, app, actor, 'saved', null);
      return app;
    });
  }

  async assertValid(
    manager: EntityManager,
    t: TournamentEntity,
    app: TournamentApplicationEntity,
    revision: ApplicationRevisionEntity,
  ) {
    const { players, representatives } = revision.snapshot;
    // A revision's policy is a historical snapshot. Admission must always use
    // the current tournament limits, including drafts saved before a change.
    const policy = this.policy(t);
    if (
      app.approvedRevisionId &&
      revision.id !== app.approvedRevisionId &&
      !policy.allowAmendments
    )
      throw new ConflictException(
        'Изменения утверждённой заявки запрещены регламентом',
      );
    if (
      players.length < policy.minPlayers ||
      players.length > policy.maxPlayers ||
      representatives.length > policy.maxRepresentatives
    )
      throw new BadRequestException('Состав не соответствует лимитам заявки');
    if (players.filter((p) => p.isCaptain).length !== 1)
      throw new BadRequestException('В составе должен быть ровно один капитан');
    if (
      players.some((p) => !p.shirtNumber) ||
      new Set(players.map((p) => p.shirtNumber)).size !== players.length
    )
      throw new BadRequestException(
        'У игроков должны быть разные игровые номера',
      );
    const current = await manager.find(TeamPlayerEntity, {
      where: {
        id: In(players.map((p) => p.teamPlayerId)),
        communityId: this.communityId(t),
        teamId: app.teamId,
        isActive: true,
      },
      relations: { player: true },
    });
    if (
      current.length !== players.length ||
      current.some((p) => !p.player.isActive)
    )
      throw new ConflictException(
        'Текущий состав изменился. Верните заявку на доработку и сохраните новую версию',
      );
    const conflict = await manager
      .getRepository(TournamentRosterPlayerEntity)
      .findOne({
        where: {
          tournamentId: t.id,
          teamId: Not(app.teamId),
          playerId: In(players.map((p) => p.playerId)),
          isActive: true,
        },
      });
    if (conflict)
      throw new ConflictException(
        'Один из игроков уже заявлен за другую команду в этом турнире',
      );
  }

  async submit(
    id: number,
    teamId: number,
    revisionId: number,
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const t = await this.lock(manager, id);
      await this.squads.assertManage(
        this.communityId(t),
        teamId,
        actor,
        manager,
      );
      const app = await manager.findOneBy(TournamentApplicationEntity, {
        tournamentId: id,
        teamId,
      });
      if (!app || app.currentRevisionId !== revisionId)
        throw new ConflictException('Версия заявки устарела');
      this.assertWritable(t, app, await this.editWindow(t, manager));
      const revision = await manager.findOneByOrFail(
        ApplicationRevisionEntity,
        { id: revisionId, applicationId: app.id },
      );
      await this.assertValid(manager, t, app, revision);
      app.status = 'submitted';
      await manager.save(TournamentApplicationEntity, app);
      await this.event(manager, app, actor, 'submitted', null);
      return app;
    });
  }

  async review(
    id: number,
    applicationId: number,
    dto: ReviewApplicationDto,
    actor: CommunityActor,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const t = await this.lock(manager, id);
      await this.access.assertAccess(
        id,
        actor,
        TournamentAccessAction.REVIEW_APPLICATIONS,
      );
      if (t.lifecycleStatus === TournamentLifecycleStatus.COMPLETED)
        throw new ConflictException('Турнир завершён');
      const app = await manager.findOneBy(TournamentApplicationEntity, {
        id: applicationId,
        tournamentId: id,
      });
      if (
        !app ||
        app.status !== 'submitted' ||
        app.currentRevisionId !== dto.revisionId
      )
        throw new ConflictException(
          'Заявка уже рассмотрена или версия устарела',
        );
      if (dto.decision === 'return') {
        if (!dto.comment?.trim())
          throw new BadRequestException('Укажите, что нужно исправить');
        app.status = 'changes_requested';
      } else {
        if ((await this.editWindow(t, manager)).locked)
          throw new ConflictException(APPLICATIONS_LOCKED_MESSAGE);
        const revision = await manager.findOneByOrFail(
          ApplicationRevisionEntity,
          { id: dto.revisionId, applicationId: app.id },
        );
        await this.assertValid(manager, t, app, revision);
        let participation = await manager.findOneBy(TournamentTeamEntity, {
          tournamentId: id,
          teamId: app.teamId,
        });
        if (
          participation &&
          participation.status !== TournamentTeamStatus.ACTIVE
        )
          throw new ConflictException(
            'Команда отозвана или дисквалифицирована',
          );
        if (
          !participation &&
          (await manager.exists(MatchEntity, {
            where: { tournamentId: id, status: Not(MatchStatus.CANCELLED) },
          }))
        )
          throw new ConflictException(
            'Нельзя добавлять новую команду после формирования календаря',
          );
        if (!participation)
          participation = await manager.save(TournamentTeamEntity, {
            tournamentId: id,
            teamId: app.teamId,
            status: TournamentTeamStatus.ACTIVE,
          });
        await manager.update(
          TournamentRosterPlayerEntity,
          { tournamentId: id, teamId: app.teamId, isActive: true },
          { isActive: false },
        );
        for (const player of revision.snapshot.players)
          await manager.save(TournamentRosterPlayerEntity, {
            ...player,
            tournamentId: id,
            tournamentTeamId: participation.id,
            teamId: app.teamId,
            revisionId: revision.id,
            isActive: true,
          });
        app.approvedRevisionId = revision.id;
        app.status = 'approved';
      }
      await manager.save(TournamentApplicationEntity, app);
      await this.event(
        manager,
        app,
        actor,
        dto.decision === 'approve' ? 'approved' : 'returned',
        dto.comment?.trim() || null,
      );
      return app;
    });
  }

  private event(
    manager: EntityManager,
    app: TournamentApplicationEntity,
    actor: CommunityActor,
    action: string,
    comment: string | null,
  ) {
    return manager.save(ApplicationEventEntity, {
      applicationId: app.id,
      revisionId: app.currentRevisionId!,
      actorUserId: actor.id,
      action,
      comment,
    });
  }

  async matchRoster(
    tournamentId: number,
    teamId: number,
  ): Promise<TeamPlayerEntity[] | null> {
    const tournament = await this.dataSource.manager.findOneByOrFail(
      TournamentEntity,
      { id: tournamentId },
    );
    if (!tournament.registrationRequired) return null; // Explicit legacy mode, never fall back for new tournaments.
    const participation = await this.dataSource.manager.findOneBy(
      TournamentTeamEntity,
      { tournamentId, teamId, status: TournamentTeamStatus.ACTIVE },
    );
    if (!participation) return [];
    const roster = await this.dataSource.manager.find(
      TournamentRosterPlayerEntity,
      {
        where: {
          tournamentId,
          teamId,
          isActive: true,
          player: { isActive: true },
        },
        relations: { player: true },
        order: { shirtNumber: 'ASC', id: 'ASC' },
      },
    );
    return roster.map((p) =>
      Object.assign(new TeamPlayerEntity(), {
        id: p.teamPlayerId,
        playerId: p.playerId,
        teamId,
        shirtNumber: p.shirtNumber,
        position: p.position,
        isCaptain: p.isCaptain,
        isActive: true,
        player: p.player,
      }),
    );
  }
}
