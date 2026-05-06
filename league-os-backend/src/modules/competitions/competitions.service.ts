import { Injectable } from '@nestjs/common';
import {FindManyOptions, Repository} from "typeorm";
import {CompetitionEntity} from "./entities/competitions.entity";
import {BaseCrudService} from "../../common/base/base-crud.service";
import {InjectRepository} from "@nestjs/typeorm";

@Injectable()
export class CompetitionsService extends BaseCrudService<CompetitionEntity> {
    constructor(
        @InjectRepository(CompetitionEntity)
        private readonly competitionsRepository: Repository<CompetitionEntity>,
    ) {
        super(competitionsRepository, 'Соревнование');
    }

}