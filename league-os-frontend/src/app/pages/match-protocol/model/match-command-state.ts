import {
    MatchCommand,
    MatchProtocolData,
    MatchProtocolEvent,
} from '../../../entities/match-service/model/match-service.types';

export const MAX_MATCH_ELAPSED_SECONDS = 86400;

export function validElapsedSeconds(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= MAX_MATCH_ELAPSED_SECONDS;
}

export const CLOCK_RECOVERY_MESSAGE =
    'Время таймера некорректно или превышает 24 часа. Организатору нужно открыть «Восстановление после сбоя» и указать фактически сыгранное время, а не время с момента разрыва связи.';

export function elapsedAt(data: MatchProtocolData, now: number): number {
    const s = data.session;
    return (
        s.elapsedSeconds +
        (['first_half', 'second_half'].includes(s.status) && s.startedAt
            ? Math.max(0, Math.floor((now - Date.parse(s.startedAt)) / 1000))
            : 0)
    );
}

// Local projection only. The server validates every operation and owns the
// official result. Never mark a locally signed protocol as server-confirmed.
export function projectCommand(
    source: MatchProtocolData,
    c: MatchCommand,
): MatchProtocolData {
    const d = structuredClone(source);
    // A reset is online-only and never projected before a server acknowledgment.
    if (c.action === 'reset') return d;
    const s = d.session;
    s.elapsedSeconds = c.elapsedSeconds;
    const previous = s.status;
    s.startedAt = null;
    d.redBalls.active = d.redBalls.active.filter(
        (b) =>
            b.activatedHalf === s.currentHalf &&
            c.elapsedSeconds < b.activatedSecond + b.durationSeconds,
    );
    switch (c.action) {
        case 'start':
            s.status = 'first_half';
            s.currentHalf = 1;
            s.elapsedSeconds = 0;
            s.startedAt = c.occurredAt;
            d.match.status = 'live';
            break;
        case 'pause':
            s.previousStatus = previous;
            s.status = 'paused';
            break;
        case 'resume':
            s.status = s.previousStatus!;
            s.previousStatus = null;
            s.startedAt = c.occurredAt;
            break;
        case 'finish-half':
            s.status = s.currentHalf === 1 ? 'half_time' : 'finished';
            break;
        case 'start-second-half':
            s.status = 'second_half';
            s.currentHalf = 2;
            s.elapsedSeconds = 0;
            s.startedAt = c.occurredAt;
            break;
        case 'finish':
            s.status = 'finished';
            break;
        case 'sign':
            // A signature is never optimistic: only the server acknowledgment
            // may turn a finished protocol into a signed one.
            break;
        case 'recover':
            s.status = 'paused';
            s.currentHalf = 2;
            s.previousStatus = 'second_half';
            break;
        case 'start-recording':
            s.previousStatus = previous;
            s.status = 'event_recording';
            break;
        case 'cancel-recording':
            s.status = s.previousStatus!;
            s.previousStatus = null;
            s.startedAt = c.occurredAt;
            break;
        case 'event': {
            const e = c.event!;
            const event: MatchProtocolEvent = {
                ...e,
                id: -(c.expectedRevision + 1),
                clientEventId: c.id,
                matchId: d.match.id,
                isCancelled: false,
            };
            const red = d.redBalls.active.find((b) => b.teamId === e.teamId);
            event.goalValue = d.redBalls.active.length ? 2 : 1;
            const home =
                (e.teamId === d.match.homeTeam.id) !==
                (e.eventType === 'own_goal');
            if (e.eventType === 'goal' || e.eventType === 'own_goal') {
                if (home) s.homeScore += event.goalValue;
                else s.awayScore += event.goalValue;
                if (e.eventType === 'goal' && red)
                    d.redBalls.active = d.redBalls.active.filter(
                        (b) => b.id !== red.id,
                    );
            }
            d.events.push(event);
            if (e.autoResume && previous === 'event_recording') {
                s.status = s.previousStatus!;
                s.previousStatus = null;
                s.startedAt = c.occurredAt;
            } else if (['first_half', 'second_half'].includes(previous))
                s.startedAt = c.occurredAt;
            break;
        }
        case 'cancel-event': {
            const event = d.events.find((e) =>
                c.eventClientId
                    ? e.clientEventId === c.eventClientId
                    : e.id === c.eventId,
            );
            if (event && !event.isCancelled) {
                event.isCancelled = true;
                const home =
                    (event.teamId === d.match.homeTeam.id) !==
                    (event.eventType === 'own_goal');
                if (
                    event.eventType === 'goal' ||
                    event.eventType === 'own_goal'
                ) {
                    if (home) s.homeScore -= event.goalValue ?? 1;
                    else s.awayScore -= event.goalValue ?? 1;
                }
            }
            if (['first_half', 'second_half'].includes(previous))
                s.startedAt = c.occurredAt;
            break;
        }
        case 'red-ball':
            d.redBalls.active.push({
                id: -(c.expectedRevision + 1),
                teamId: c.teamId!,
                activatedHalf: s.currentHalf,
                activatedSecond: c.elapsedSeconds,
                durationSeconds: 120,
                status: 'active',
            });
            d.redBalls.usedTeamIds.push(c.teamId!);
            if (['first_half', 'second_half'].includes(previous))
                s.startedAt = c.occurredAt;
            break;
    }
    if (s.status === 'finished' || s.status === 'protocol_signed') {
        d.match.status = 'finished';
        s.finishedAt = c.occurredAt;
    }
    s.revision = c.expectedRevision + 1;
    return d;
}
