export enum MatchEventType {
    GOAL = 'goal',
    OWN_GOAL = 'own_goal',
    PENALTY_GOAL = 'penalty_goal',
    PENALTY_MISSED = 'penalty_missed',

    YELLOW_CARD = 'yellow_card',
    SECOND_YELLOW_CARD = 'second_yellow_card',
    RED_CARD = 'red_card',

    SUBSTITUTION = 'substitution',

    RED_BALL = 'red_ball',

    MATCH_STARTED = 'match_started',
    MATCH_PAUSED = 'match_paused',
    MATCH_RESUMED = 'match_resumed',
    HALF_FINISHED = 'half_finished',
    SECOND_HALF_STARTED = 'second_half_started',
    MATCH_FINISHED = 'match_finished',
    PROTOCOL_SIGNED = 'protocol_signed',
}