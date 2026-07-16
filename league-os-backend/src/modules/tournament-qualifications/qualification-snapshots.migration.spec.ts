import { QualificationSnapshots1784150050000 } from '../../database/migrations/1784150050000-qualification-snapshots';

describe('qualification snapshots migration', () => {
  it('creates immutable preview/confirmed snapshots and relational entries', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        statements.push(sql);
        return Promise.resolve();
      }),
    };

    await new QualificationSnapshots1784150050000().up(queryRunner as never);
    const sql = statements.join('\n');

    expect(sql).toContain('tournament_qualification_snapshots');
    expect(sql).toContain('tournament_qualification_snapshot_entries');
    expect(sql).toContain('qualification_snapshot_status_enum');
    expect(sql).toContain('UQ_qualification_snapshot_current');
    expect(sql).toContain('source_hash');
    expect(sql).toContain('resolution_input');
    expect(sql).not.toContain('synchronize');
  });
});
