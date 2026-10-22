import { FindOperator, Raw } from 'typeorm';

export const MATCH_TIME_ZONE = 'Europe/Moscow';

const currentMatchDateTimeSql =
  '(CURRENT_TIMESTAMP AT TIME ZONE :matchTimeZone)';

function matchDateTimeComparedToNow(
  comparisonOperator: '<' | '>=',
): FindOperator<Date> {
  return Raw(
    (alias) => `${alias} ${comparisonOperator} ${currentMatchDateTimeSql}`,
    { matchTimeZone: MATCH_TIME_ZONE },
  );
}

export function matchDateTimeBeforeNow(): FindOperator<Date> {
  return matchDateTimeComparedToNow('<');
}

export function matchDateTimeAtOrAfterNow(): FindOperator<Date> {
  return matchDateTimeComparedToNow('>=');
}
