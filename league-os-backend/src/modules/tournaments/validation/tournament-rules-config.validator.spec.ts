import { TournamentRulesConfigValidator } from './tournament-rules-config.validator';
import { createYardLeagueRules } from './yard-league-rules.fixture';

describe('TournamentRulesConfigValidator', () => {
  const validator = new TournamentRulesConfigValidator();

  it('accepts the typed Yard League configuration', () => {
    expect(validator.validate(createYardLeagueRules())).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('rejects executable-expression fields', () => {
    const config = createYardLeagueRules() as unknown as Record<
      string,
      unknown
    >;
    (config.stages as Array<Record<string, unknown>>)[0].expression =
      'teams.sort(() => process.exit())';

    const result = validator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'UNSUPPORTED_FIELD',
        path: '$.stages[0].expression',
      }),
    );
  });

  it('checks qualification count against the knockout bracket', () => {
    const config = createYardLeagueRules();
    if (config.stages[1].type === 'knockout') {
      config.stages[1].bracket.size = 8;
    }

    const result = validator.validate(config);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'QUALIFICATION_BRACKET_MISMATCH' }),
    );
  });

  it('requires a deterministic knockout winner', () => {
    const config = createYardLeagueRules();
    if (config.stages[1].type === 'knockout') {
      config.stages[1].match.penalties = { enabled: false };
    }

    const result = validator.validate(config);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'KNOCKOUT_WINNER_REQUIRED' }),
    );
  });

  it('requires a final tie-resolution rule', () => {
    const config = createYardLeagueRules();
    if (config.stages[0].type === 'group_stage') {
      config.stages[0].standings.tieBreakers.pop();
    }

    const result = validator.validate(config);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INCOMPLETE_TIE_BREAKERS' }),
    );
  });

  it('validates disciplinary thresholds', () => {
    const config = createYardLeagueRules();
    const rule = config.stages[0].discipline.accumulatedYellows;
    if (rule.enabled) rule.threshold = 0;

    const result = validator.validate(config);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_INTEGER',
        path: '$.stages[0].discipline.accumulatedYellows.threshold',
      }),
    );
  });
});
