import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityActor } from '../communities/communities.service';
import { PlayerProfilesService } from './player-profiles.service';
import {
  PlayerIdentityChangeDto,
  PlayerPhotoDto,
  PlayerProfileContextDto,
  PlayerProfileQueryDto,
  ReviewPlayerIdentityDto,
} from './player-profile.dto';

@Controller('communities/:communityId/player-profiles')
@UseGuards(JwtAuthGuard)
export class PlayerProfilesController {
  constructor(private readonly profiles: PlayerProfilesService) {}
  @Get() search(
    @Param('communityId', ParseIntPipe) c: number,
    @Query() q: PlayerProfileQueryDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.profiles.search(c, q.search, q.page, req.user);
  }
  @Get('corrections') requests(
    @Param('communityId', ParseIntPipe) c: number,
    @Query() q: PlayerProfileQueryDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.profiles.requests(c, q.page, req.user);
  }
  @Post('corrections/:id/review') review(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewPlayerIdentityDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.profiles.review(c, id, dto, req.user);
  }
  @Get(':playerId') profile(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('playerId', ParseIntPipe) p: number,
    @Query() q: PlayerProfileContextDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.profiles.profile(c, p, req.user, q.teamId);
  }
  @Post(':playerId/corrections') submit(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('playerId', ParseIntPipe) p: number,
    @Body() dto: PlayerIdentityChangeDto,
    @Req() req: { user: CommunityActor },
  ) {
    return this.profiles.submit(c, p, dto, req.user);
  }
  @Post(':playerId/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  photo(
    @Param('communityId', ParseIntPipe) c: number,
    @Param('playerId', ParseIntPipe) p: number,
    @Body() dto: PlayerPhotoDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() req: { user: CommunityActor },
  ) {
    if (!file) throw new BadRequestException('Выберите фотографию');
    return this.profiles.photo(
      c,
      p,
      dto.teamId,
      dto.expectedPhotoUrl,
      file.buffer,
      req.user,
    );
  }
}
