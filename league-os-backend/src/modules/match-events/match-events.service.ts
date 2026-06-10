import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchEventEntity } from './entities/match-event.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { MatchEntity } from '../matches/entities/match.entity';
import { Repository } from 'typeorm';
import { PlayerTournamentStatsService } from '../player-tournament-stats/player-tournament-stats.service';
import { CreateMatchEventDto } from './dto/create-match-event.dto';

@Injectable()
export class MatchEventsService {
  constructor(
    @InjectRepository(MatchEventEntity)
    private readonly matchEventRepository: Repository<MatchEventEntity>,

    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,

    private readonly playerTournamentStatsService: PlayerTournamentStatsService,
  ) {}

  async create(
    createMatchEventDto: CreateMatchEventDto,
  ): Promise<MatchEventEntity> {
    const match = await this.matchRepository.findOne({
      where: {
        id: createMatchEventDto.matchId,
      },
    });

    if (!match) {
      throw new NotFoundException('Матч не найден');
    }

    const event = this.matchEventRepository.create(createMatchEventDto);

    const savedEvent = await this.matchEventRepository.save(event);

    if (savedEvent.playerId) {
      await this.playerTournamentStatsService.applyCardEvent({
        match,
        teamId: savedEvent.teamId,
        playerId: savedEvent.playerId,
        eventType: savedEvent.eventType,
      });
    }

    return savedEvent;
  }

  async findByMatch(matchId: number): Promise<MatchEventEntity[]> {
    return this.matchEventRepository.find({
      where: {
        matchId,
      },
      relations: {
        team: true,
        player: true,
        assistPlayer: true,
        secondaryPlayer: true,
      },
      order: {
        minute: 'ASC',
        addedMinute: 'ASC',
        id: 'ASC',
      },
    });
  }

  async remove(id: number): Promise<void> {
    const event = await this.matchEventRepository.findOne({
      where: {
        id,
      },
    });

    if (!event) {
      throw new NotFoundException('Событие матча не найдено');
    }

    await this.matchEventRepository.remove(event);
  }
}
