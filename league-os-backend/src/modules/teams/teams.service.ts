import { Injectable } from '@nestjs/common';
import { TeamEntity } from './entities/team.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
  ) {}
  async findMany(): Promise<TeamEntity[]> {
    return this.teamsRepository.find({
      where: {
        isActive: true,
      },
      order: {
        name: 'ASC',
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        city: true,
        village: true,
        isActive: true,
      },
    });
  }
}
