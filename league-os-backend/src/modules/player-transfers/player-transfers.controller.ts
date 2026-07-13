import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePlayerTransferDto } from './dto/create-player-transfer.dto';
import { PlayerTransfersService } from './player-transfers.service';

@Controller('admin/player-transfers')
@UseGuards(JwtAuthGuard)
export class PlayerTransfersController {
  constructor(private readonly service: PlayerTransfersService) {}
  @Get() findAll(@Req() req: any) { return this.service.findAll(req.user.id); }
  @Post() create(@Body() dto: CreatePlayerTransferDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }
}
