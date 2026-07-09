import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamPlayersService } from '../team-players/team-players.service';
import { CreateTeamPlayerDto } from '../team-players/dto/create-team-player.dto';
import { UpdateTeamPlayerDto } from '../team-players/dto/update-team-player.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

const PLAYER_PHOTO_MAX_SIZE = 5 * 1024 * 1024;

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly teamPlayersService: TeamPlayersService,
  ) {}

  @Get()
  findMany() {
    return this.teamsService.findMany();
  }

  @Get(':teamId/players')
  findPlayersByTeam(@Param('teamId', ParseIntPipe) teamId: number) {
    return this.teamPlayersService.findByTeam(teamId);
  }

  @Post(':teamId/players')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: PLAYER_PHOTO_MAX_SIZE },
      fileFilter: (_request, file, callback) => {
        if (file.mimetype !== 'image/png') {
          return callback(
            new BadRequestException('Фото игрока должно быть в формате PNG'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  createPlayerForTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateTeamPlayerDto,
    @Req() req: any,
    @UploadedFile() photo?: { buffer: Buffer },
  ) {
    return this.teamPlayersService.createForTeam(teamId, dto, req.user.id, photo);
  }

  @Patch(':teamId/players/:teamPlayerId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: PLAYER_PHOTO_MAX_SIZE },
      fileFilter: (_request, file, callback) => {
        if (file.mimetype !== 'image/png') {
          return callback(
            new BadRequestException('Фото игрока должно быть в формате PNG'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  updatePlayerForTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('teamPlayerId', ParseIntPipe) teamPlayerId: number,
    @Body() dto: UpdateTeamPlayerDto,
    @Req() req: any,
    @UploadedFile() photo?: { buffer: Buffer },
  ) {
    return this.teamPlayersService.updateForTeam(
      teamId,
      teamPlayerId,
      dto,
      req.user.id,
      photo,
    );
  }
}
