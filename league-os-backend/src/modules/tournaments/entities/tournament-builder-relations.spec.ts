import { getMetadataArgsStorage } from 'typeorm';

import { MatchEntity } from '../../matches/entities/match.entity';
import { TournamentGroupEntity } from '../../tournament-groups/entities/tournament-group.entity';
import { TournamentMemberEntity } from '../../tournament-members/entities/tournament-member.entity';
import { TournamentRuleVersionEntity } from '../../tournament-rules/entities/tournament-rule-version.entity';
import { TournamentStageParticipantEntity } from '../../tournament-stage-participants/entities/tournament-stage-participant.entity';
import { TournamentStageEntity } from '../../tournament-stages/entities/tournament-stage.entity';
import { TournamentEntity } from './tournaments.entity';

type EntityClass = new () => object;

function relationNames(target: EntityClass): string[] {
  return getMetadataArgsStorage()
    .relations.filter((relation) => relation.target === target)
    .map((relation) => relation.propertyName);
}

function indexNames(target: EntityClass): string[] {
  return getMetadataArgsStorage()
    .indices.filter((index) => index.target === target)
    .map((index) => index.name)
    .filter((name): name is string => Boolean(name));
}

describe('Tournament builder entity metadata', () => {
  it('connects tournament to owner, stages, versions and members', () => {
    expect(relationNames(TournamentEntity)).toEqual(
      expect.arrayContaining([
        'owner',
        'activeRuleVersion',
        'stages',
        'ruleVersions',
        'members',
      ]),
    );
  });

  it('connects stages, groups and stage participants', () => {
    expect(relationNames(TournamentStageEntity)).toEqual(
      expect.arrayContaining([
        'tournament',
        'groups',
        'participants',
        'matches',
      ]),
    );
    expect(relationNames(TournamentGroupEntity)).toEqual(
      expect.arrayContaining(['stage', 'participants', 'matches']),
    );
    expect(relationNames(TournamentStageParticipantEntity)).toEqual(
      expect.arrayContaining(['stage', 'tournamentTeam', 'group']),
    );
  });

  it('connects matches to the structural and effective rule context', () => {
    expect(relationNames(MatchEntity)).toEqual(
      expect.arrayContaining(['stage', 'group', 'effectiveRuleVersion']),
    );
    expect(indexNames(MatchEntity)).toEqual(
      expect.arrayContaining([
        'IDX_matches_stage',
        'IDX_matches_group',
        'IDX_matches_effective_rule_version',
        'IDX_matches_stage_round',
      ]),
    );
  });

  it('declares lookup indexes for rule versions and memberships', () => {
    expect(indexNames(TournamentRuleVersionEntity)).toEqual(
      expect.arrayContaining([
        'IDX_tournament_rule_versions_tournament',
        'IDX_tournament_rule_versions_status',
      ]),
    );
    expect(indexNames(TournamentMemberEntity)).toEqual(
      expect.arrayContaining([
        'IDX_tournament_members_tournament',
        'IDX_tournament_members_user',
      ]),
    );
  });
});
