import { BadRequestException, Injectable } from '@nestjs/common';

export interface RoundRobinPair {
  homeTeamId: number;
  awayTeamId: number;
}

export interface RoundRobinRound {
  roundNumber: number;
  legNumber: number;
  pairs: RoundRobinPair[];
  byeTeamId?: number;
}

@Injectable()
export class RoundRobinGenerator {
  generate(teamIds: number[], legs: number): RoundRobinRound[] {
    if (teamIds.length < 2) {
      throw new BadRequestException('Round-robin requires at least two teams');
    }
    if (!Number.isInteger(legs) || legs < 1 || legs > 4) {
      throw new BadRequestException('legs must be an integer between 1 and 4');
    }
    if (new Set(teamIds).size !== teamIds.length) {
      throw new BadRequestException('Round-robin team ids must be unique');
    }

    const rotation: Array<number | null> = [...teamIds];
    if (rotation.length % 2 === 1) rotation.push(null);

    const slots = rotation.length;
    const roundsPerLeg = slots - 1;
    const baseRounds: Array<{
      pairs: RoundRobinPair[];
      byeTeamId?: number;
    }> = [];

    for (let roundIndex = 0; roundIndex < roundsPerLeg; roundIndex += 1) {
      const pairs: RoundRobinPair[] = [];
      let byeTeamId: number | undefined;

      for (let index = 0; index < slots / 2; index += 1) {
        const left = rotation[index];
        const right = rotation[slots - 1 - index];
        if (left === null || right === null) {
          byeTeamId = left ?? right ?? undefined;
          continue;
        }
        const reverse = (roundIndex + index) % 2 === 1;
        pairs.push({
          homeTeamId: reverse ? right : left,
          awayTeamId: reverse ? left : right,
        });
      }
      baseRounds.push({ pairs, byeTeamId });

      const last = rotation.pop();
      rotation.splice(1, 0, last ?? null);
    }

    const result: RoundRobinRound[] = [];
    for (let legIndex = 0; legIndex < legs; legIndex += 1) {
      for (
        let roundIndex = 0;
        roundIndex < baseRounds.length;
        roundIndex += 1
      ) {
        const base = baseRounds[roundIndex];
        const reverse = legIndex % 2 === 1;
        result.push({
          roundNumber: legIndex * roundsPerLeg + roundIndex + 1,
          legNumber: legIndex + 1,
          pairs: base.pairs.map((pair) => ({
            homeTeamId: reverse ? pair.awayTeamId : pair.homeTeamId,
            awayTeamId: reverse ? pair.homeTeamId : pair.awayTeamId,
          })),
          byeTeamId: base.byeTeamId,
        });
      }
    }
    return result;
  }
}
