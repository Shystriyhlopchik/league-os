import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findPublicById(teamId: number): Promise<TeamEntity> {
    const team = await this.teamsRepository.findOne({
      where: {
        id: teamId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        slug: true,
        description: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        city: true,
        village: true,
        foundedYear: true,
        isActive: true,
      },
    });

    if (!team) {
      throw new NotFoundException('Команда не найдена');
    }

    return team;
  }
}
