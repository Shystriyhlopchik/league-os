import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { NewsModule } from './modules/news/news.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { MatchOfficialsModule } from './modules/match-officials/match-officials.module';
import { RolesModule } from './modules/roles/roles.module';
import { MatchServiceModule } from './modules/match-service/match-service.module';
import { PlayerTournamentStatsModule } from './modules/player-tournament-stats/player-tournament-stats.module';
import { MatchRostersModule } from './modules/match-rosters/match-rosters.module';
import { PlayerTransfersModule } from './modules/player-transfers/player-transfers.module';
import { TournamentStagesModule } from './modules/tournament-stages/tournament-stages.module';
import { TournamentGroupsModule } from './modules/tournament-groups/tournament-groups.module';
import { TournamentRulesModule } from './modules/tournament-rules/tournament-rules.module';
import { TournamentMembersModule } from './modules/tournament-members/tournament-members.module';
import { TournamentStageParticipantsModule } from './modules/tournament-stage-participants/tournament-stage-participants.module';
import { FeatureFlagsModule } from './common/feature-flags/feature-flags.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    FeatureFlagsModule,
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
        synchronize: false,
      }),
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
    NewsModule,
    UsersModule,
    AuthModule,
    MatchOfficialsModule,
    RolesModule,
    MatchServiceModule,
    PlayerTournamentStatsModule,
    MatchRostersModule,
    PlayerTransfersModule,
    TournamentStagesModule,
    TournamentGroupsModule,
    TournamentRulesModule,
    TournamentMembersModule,
    TournamentStageParticipantsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
