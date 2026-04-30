import { CreateCompetitionDto } from './create-competition.dto';
import { PartialType } from "@nestjs/mapped-types";

export class UpdateCompetitionDto extends PartialType(CreateCompetitionDto) {}