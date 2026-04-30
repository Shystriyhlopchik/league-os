import { Module } from '@nestjs/common';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import {TypeOrmModule} from "@nestjs/typeorm";
import {VenueEntity} from "./entities/venue.entity";

@Module({
  imports: [TypeOrmModule.forFeature([VenueEntity])],
  controllers: [VenuesController],
  providers: [VenuesService]
})
export class VenuesModule {}
