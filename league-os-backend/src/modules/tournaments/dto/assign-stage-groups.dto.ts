import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { GroupAssignmentStrategy } from '../enums/group-assignment-strategy.enum';

export class ManualGroupAssignmentDto {
  @IsInt()
  @Min(1)
  tournamentTeamId: number;

  @IsInt()
  @Min(1)
  groupId: number;
}

export class AssignStageGroupsDto {
  @IsEnum(GroupAssignmentStrategy)
  strategy: GroupAssignmentStrategy;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualGroupAssignmentDto)
  assignments?: ManualGroupAssignmentDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  randomSeed?: number;
}
