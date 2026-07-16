import { buildTournamentRules } from './tournament-builder.mapper';
import { createTournamentTemplate } from './tournament-templates';

describe('tournament templates', () => {
    it('creates the Yard League structure and typed rules', () => {
        const draft = createTournamentTemplate('yard_league');
        const groupStage = draft.stages.find(
            (stage) => stage.type === 'group_stage',
        );
        const playoff = draft.stages.find(
            (stage) => stage.type === 'knockout',
        );
        const config = buildTournamentRules(draft);

        expect(groupStage?.groups.length).toBe(3);
        expect(groupStage?.groups.every((group) => group.capacity === 5)).toBeTrue();
        expect(playoff?.bracketSize).toBe(4);
        expect(draft.tieBreakers).toEqual([
            'head_to_head',
            'wins',
            'goal_difference',
            'goals_for',
            'draw',
        ]);
        expect(draft.qualification.crossGroupCriteria).toEqual([
            'points',
            'goal_difference',
            'goals_for',
            'draw_lots',
        ]);
        expect(draft.playoff.seeding).toBe('best_eligible_opponent');
        expect(draft.playoff.avoidSameSourceGroup).toBeTrue();
        expect(draft.playoffMatchRules.extraTimeEnabled).toBeFalse();
        expect(draft.playoffMatchRules.penaltiesEnabled).toBeTrue();
        expect(config.transitions.length).toBe(1);
    });

    it('creates independent template instances', () => {
        const first = createTournamentTemplate('groups_playoff');
        const second = createTournamentTemplate('groups_playoff');

        first.stages[0].groups[0].name = 'Изменено';

        expect(second.stages[0].groups[0].name).toBe('Группа A');
    });
});
