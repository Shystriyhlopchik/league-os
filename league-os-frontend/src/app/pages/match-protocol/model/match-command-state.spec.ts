import {
    MatchCommand,
    MatchProtocolData,
} from '../../../entities/match-service/model/match-service.types';
import { elapsedAt, projectCommand } from './match-command-state';

export function protocolFixture(): MatchProtocolData {
    return {
        match: {
            id: 99,
            tournamentId: 1,
            status: 'scheduled',
            homeTeam: { id: 10, name: 'Home' },
            awayTeam: { id: 20, name: 'Away' },
        },
        session: {
            id: 1,
            matchId: 99,
            revision: 0,
            status: 'not_started',
            currentHalf: 1,
            elapsedSeconds: 0,
            homeScore: 0,
            awayScore: 0,
        },
        rosters: { home: [], away: [] },
        events: [],
        redBalls: { active: [], usedTeamIds: [] },
    };
}
describe('Offline match projection', () => {
    const cmd = (
        action: MatchCommand['action'],
        revision: number,
        payload: Partial<MatchCommand> = {},
    ): MatchCommand => ({
        id: crypto.randomUUID(),
        action,
        expectedRevision: revision,
        occurredAt: '2026-11-15T12:00:00Z',
        elapsedSeconds: 60,
        ...payload,
    });
    it('preserves the source snapshot and projects start, pause and resume with captured time', () => {
        const original = protocolFixture();
        const started = projectCommand(original, cmd('start', 0));
        expect(original.session.status).toBe('not_started');
        expect(elapsedAt(started, Date.parse('2026-11-15T12:01:00Z'))).toBe(60);
        const paused = projectCommand(started, cmd('pause', 1));
        expect(paused.session.elapsedSeconds).toBe(60);
        expect(paused.session.startedAt).toBeNull();
        expect(projectCommand(paused, cmd('resume', 2)).session.status).toBe(
            'first_half',
        );
    });
    it('projects a goal once and allows cancellation by persistent client UUID', () => {
        const started = projectCommand(protocolFixture(), cmd('start', 0));
        const goal = cmd('event', 1, {
            event: { eventType: 'goal', teamId: 10, playerId: 3 },
        });
        const scored = projectCommand(started, goal);
        expect(scored.session.homeScore).toBe(1);
        const cancelled = projectCommand(
            scored,
            cmd('cancel-event', 2, { eventClientId: goal.id }),
        );
        expect(cancelled.session.homeScore).toBe(0);
        expect(cancelled.events[0].isCancelled).toBeTrue();
    });
    it('keeps an offline finish preliminary while the journal still contains commands', () => {
        let current = protocolFixture();
        for (const [revision, action] of (
            ['start', 'finish-half', 'start-second-half', 'finish'] as const
        ).entries())
            current = projectCommand(current, cmd(action, revision));
        expect(current.session.status).toBe('finished');
        expect(current.session.status).not.toBe('protocol_signed');
        expect(current.session.revision).toBe(4);
        expect(projectCommand(current, cmd('sign', 4)).session.status).toBe('finished');
    });
    it('uses the league red-ball weighting for either side and own goals', () => {
        const active = projectCommand(
            projectCommand(protocolFixture(), cmd('start', 0)),
            cmd('red-ball', 1, { teamId: 10 }),
        );
        const awayGoal = projectCommand(
            active,
            cmd('event', 2, {
                event: { eventType: 'goal', teamId: 20, playerId: 3 },
            }),
        );
        expect(awayGoal.session.awayScore).toBe(2);
        const ownGoal = projectCommand(
            active,
            cmd('event', 2, {
                event: { eventType: 'own_goal', teamId: 10, playerId: 3 },
            }),
        );
        expect(ownGoal.session.awayScore).toBe(2);
    });
});
