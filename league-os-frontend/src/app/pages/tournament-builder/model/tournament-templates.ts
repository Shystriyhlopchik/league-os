import {
    DisciplineDraft,
    MatchRulesDraft,
    TournamentBuilderDraft,
    TournamentStageDraft,
    TournamentTemplateId,
} from './tournament-builder.types';

const defaultDiscipline = (): DisciplineDraft => ({
    accumulatedYellowsEnabled: true,
    yellowThreshold: 3,
    suspensionMatches: 1,
    yellowProgression: 'reset_after_suspension',
    secondYellowEnabled: true,
    secondYellowMinimumMatches: 1,
    directRedEnabled: true,
    directRedMinimumMatches: 1,
    allowManualExtension: true,
    carryYellowCards: true,
    carryPendingSuspensions: true,
});

const defaultGroupMatchRules = (): MatchRulesDraft => ({
    periods: 2,
    periodDurationMinutes: 45,
    allowDraw: true,
    extraTimeEnabled: false,
    extraTimePeriods: 2,
    extraTimePeriodDurationMinutes: 15,
    penaltiesEnabled: false,
    initialKicksPerTeam: 5,
    suddenDeath: true,
});

const defaultPlayoffMatchRules = (): MatchRulesDraft => ({
    periods: 2,
    periodDurationMinutes: 45,
    allowDraw: false,
    extraTimeEnabled: true,
    extraTimePeriods: 2,
    extraTimePeriodDurationMinutes: 15,
    penaltiesEnabled: true,
    initialKicksPerTeam: 5,
    suddenDeath: true,
});

function groups(
    stageKey: string,
    count: number,
    capacity: number | number[],
): TournamentStageDraft['groups'] {
    const capacities = Array.isArray(capacity)
        ? capacity
        : Array.from({ length: count }, () => capacity);
    return Array.from({ length: count }, (_, index) => ({
        clientKey: `${stageKey}-group-${index + 1}`,
        key: String.fromCharCode(65 + index),
        name: `Группа ${String.fromCharCode(65 + index)}`,
        order: index + 1,
        capacity: capacities[index] ?? capacities[0] ?? 2,
    }));
}

function baseDraft(templateId: TournamentTemplateId): TournamentBuilderDraft {
    return {
        draftSchemaVersion: 1,
        localId: crypto.randomUUID(),
        lifecycleStatus: 'draft',
        templateId,
        currentStep: 0,
        details: {
            seasonId: 1,
            name: '',
            slug: '',
            description: '',
            type: 'league',
            format: 'round_robin',
            startDate: '',
            endDate: '',
            colorPrimary: '#72DF9C',
            colorSecondary: '#FFD91A',
            logoUrl: '',
        },
        stages: [],
        participants: [],
        removedStageParticipantIds: [],
        groupAssignmentStrategy: 'manual',
        scoring: {
            win: 3,
            draw: 1,
            loss: 0,
            technicalWin: 3,
            technicalLoss: 0,
        },
        tieBreakers: [
            'points',
            'head_to_head',
            'wins',
            'goal_difference',
            'goals_for',
            'draw',
        ],
        qualification: {
            enabled: false,
            winnersPerGroup: 1,
            bestPlacedSourcePosition: 2,
            bestPlacedCount: 0,
            crossGroupCriteria: [
                'points',
                'goal_difference',
                'goals_for',
                'draw_lots',
            ],
            normalizeUnequalGroups: false,
            confirmationRequired: true,
        },
        playoff: {
            enabled: false,
            bracketSize: 4,
            seeding: 'standard',
            avoidSameSourceGroup: false,
            constraintMode: 'best_effort',
            thirdPlaceMatch: false,
            candidateRanking: [
                'points',
                'goal_difference',
                'goals_for',
                'draw_lots',
            ],
        },
        groupMatchRules: defaultGroupMatchRules(),
        playoffMatchRules: defaultPlayoffMatchRules(),
        discipline: defaultDiscipline(),
        changeSummary: '',
    };
}

export function createTournamentTemplate(
    templateId: TournamentTemplateId,
): TournamentBuilderDraft {
    const draft = baseDraft(templateId);

    if (templateId === 'round_robin') {
        draft.details.format = 'round_robin';
        draft.stages = [
            {
                clientKey: 'league',
                key: 'league',
                name: 'Регулярный чемпионат',
                type: 'round_robin',
                order: 1,
                startDate: '',
                endDate: '',
                legs: 2,
                groups: [],
            },
        ];
    }

    if (templateId === 'knockout') {
        draft.details.type = 'cup';
        draft.details.format = 'knockout';
        draft.playoff.enabled = true;
        draft.playoff.bracketSize = 8;
        draft.playoff.thirdPlaceMatch = false;
        draft.stages = [
            {
                clientKey: 'cup',
                key: 'cup',
                name: 'Кубковая сетка',
                type: 'knockout',
                order: 1,
                startDate: '',
                endDate: '',
                legs: 1,
                groups: [],
                bracketSize: 8,
                thirdPlaceMatch: false,
            },
        ];
    }

    if (templateId === 'groups_playoff' || templateId === 'yard_league') {
        const yard = templateId === 'yard_league';
        const groupCount = yard ? 3 : 4;
        const groupSizes = yard ? [6, 5, 5] : 4;

        draft.details.format = 'mixed';
        draft.details.name = yard ? 'Дворовая лига' : '';
        draft.details.slug = yard ? 'yard-league' : '';
        draft.qualification.enabled = true;
        draft.qualification.bestPlacedCount = yard ? 1 : 0;
        draft.playoff.enabled = true;
        draft.playoff.bracketSize = yard ? 4 : 8;
        draft.playoff.thirdPlaceMatch = true;
        draft.playoff.seeding = yard ? 'best_eligible_opponent' : 'standard';
        draft.playoff.avoidSameSourceGroup = yard;
        draft.tieBreakers = yard
            ? ['head_to_head', 'wins', 'goal_difference', 'goals_for', 'draw']
            : draft.tieBreakers;
        draft.stages = [
            {
                clientKey: 'groups',
                key: 'groups',
                name: 'Групповой этап',
                type: 'group_stage',
                order: 1,
                startDate: '',
                endDate: '',
                legs: 1,
                groups: groups('groups', groupCount, groupSizes),
            },
            {
                clientKey: 'playoff',
                key: 'playoff',
                name: 'Плей-офф',
                type: 'knockout',
                order: 2,
                startDate: '',
                endDate: '',
                legs: 1,
                groups: [],
                bracketSize: yard ? 4 : 8,
                thirdPlaceMatch: true,
            },
        ];

        if (yard) {
            draft.qualification.normalizeUnequalGroups = true;
            draft.groupMatchRules = {
                ...defaultGroupMatchRules(),
                periodDurationMinutes: 20,
            };
            draft.playoffMatchRules = {
                ...defaultPlayoffMatchRules(),
                periodDurationMinutes: 20,
                extraTimeEnabled: false,
            };
            draft.discipline = {
                ...defaultDiscipline(),
                yellowProgression: 'every_card_after_threshold',
                carryYellowCards: false,
                carryPendingSuspensions: false,
            };
        }
    }

    return draft;
}

export const TOURNAMENT_TEMPLATES: Array<{
    id: TournamentTemplateId;
    title: string;
    description: string;
}> = [
    {
        id: 'round_robin',
        title: 'Круговой чемпионат',
        description:
            'Один этап, каждый играет с каждым в один или несколько кругов.',
    },
    {
        id: 'knockout',
        title: 'Кубок',
        description:
            'Сетка на выбывание со стандартным, случайным или ручным посевом.',
    },
    {
        id: 'groups_playoff',
        title: 'Группы + плей-офф',
        description:
            'Групповой этап, квалификация и последующая кубковая сетка.',
    },
    {
        id: 'yard_league',
        title: 'Дворовая лига',
        description:
            '16 команд: группы по 6, 5 и 5 команд, лучшая вторая команда и финальная четвёрка.',
    },
    {
        id: 'clone',
        title: 'Копия турнира',
        description: 'Создать новый draft из ранее сохранённого конструктора.',
    },
];
