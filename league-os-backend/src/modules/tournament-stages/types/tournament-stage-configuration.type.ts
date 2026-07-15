export type TournamentStageConfiguration =
  | RoundRobinStageConfiguration
  | GroupStageConfiguration
  | KnockoutStageConfiguration;

interface StageConfigurationBase {
  schemaVersion: 1;
}

export interface RoundRobinStageConfiguration extends StageConfigurationBase {
  type: 'round_robin';
  legs?: 1 | 2 | 3 | 4;
}

export interface GroupStageConfiguration extends StageConfigurationBase {
  type: 'group_stage';
  groupsCount?: number;
  teamsPerGroup?: number;
  legs?: 1 | 2 | 3 | 4;
}

export interface KnockoutStageConfiguration extends StageConfigurationBase {
  type: 'knockout';
  bracketSize?: 2 | 4 | 8 | 16 | 32;
  thirdPlaceMatch?: boolean;
}
