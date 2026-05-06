import {Controller, Get} from '@nestjs/common';
import { CompetitionsService } from "./competitions.service";

@Controller('competitions')
export class CompetitionsController {
    constructor(private readonly competitionsService: CompetitionsService) {}

    @Get()
    getAllCompetitions() {
        return this.competitionsService.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                isActive: true,
                colorPrimary: true,
            },
            order: {
                createdAt: 'ASC',
            },
        });
    }
}
