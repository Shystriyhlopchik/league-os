export enum MatchEventType {
    GOAL = 'goal',
    OWN_GOAL = 'own_goal',
    PENALTY_GOAL = 'penalty_goal',
    PENALTY_MISSED = 'penalty_missed',

    YELLOW_CARD = 'yellow_card',
    RED_CARD = 'red_card',

    SUBSTITUTION = 'substitution',

    MATCH_STARTED = 'match_started',
    MATCH_FINISHED = 'match_finished',
}