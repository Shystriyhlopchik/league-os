import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CompetitionsModule } from './modules/competitions/competitions.module';
import { SeasonsModule } from './modules/seasons/seasons.module';
import { TournamentsModule } from './modules/tournaments/tournaments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { PlayersModule } from './modules/players/players.module';
import { MatchesModule } from './modules/matches/matches.module';
import { MatchEventsModule } from './modules/match-events/match-events.module';
import { StandingsModule } from './modules/standings/standings.module';
import { VenuesModule } from './modules/venues/venues.module';
import { TeamPlayersModule } from './modules/team-players/team-players.module';
import { TournamentTeamsModule } from './modules/tournament-teams/tournament-teams.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: undefined,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: Number(configService.get<string>('POSTGRES_PORT', '5432')),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        autoLoadEntities: true,
        synchronize: true,
      })
    }),
    CompetitionsModule,
    SeasonsModule,
    TournamentsModule,
    TeamsModule,
    PlayersModule,
    MatchesModule,
    MatchEventsModule,
    StandingsModule,
    VenuesModule,
    TeamPlayersModule,
    TournamentTeamsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
