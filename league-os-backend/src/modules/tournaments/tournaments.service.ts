import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TournamentEntity } from './entities/tournaments.entity';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../../common/base/base-crud.service';

@Injectable()
export class TournamentsService extends BaseCrudService<TournamentEntity> {
  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,
  ) {
    super(tournamentsRepository, 'Турнир');
  }

  async findBySeason(seasonId: number) {
    const tournaments = await this.tournamentsRepository.find({
      where: {
        seasonId,
        isActive: true,
      },
      relations: {
        season: {
          competition: true,
        },
      },
      order: {
        startDate: 'ASC',
        id: 'ASC',
      },
    });

    return tournaments.map((tournament) => ({
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      description: tournament.description,
      type: tournament.type,
      format: tournament.format,
      status: tournament.status,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      logoUrl: tournament.logoUrl,
      colorPrimary: tournament.colorPrimary,

      season: {
        id: tournament.season.id,
        name: tournament.season.name,
        year: tournament.season.year,
      },

      competition: {
        id: tournament.season.competition.id,
        name: tournament.season.competition.name,
        slug: tournament.season.competition.slug,
        logoUrl: tournament.season.competition.logoUrl,
        colorPrimary: tournament.season.competition.colorPrimary,
      },
    }));
  }
}
