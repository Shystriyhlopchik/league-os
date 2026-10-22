import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { CommunitiesService } from './communities.service';
import { CommunityEntity } from './entities/community.entity';
import { CommunityMemberEntity } from './entities/community-member.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CommunityUsersQuery } from './community.dto';

describe('Community PostgreSQL query generation (no connection)', () => {
  const db = new DataSource({
    type: 'postgres',
    entities: [join(__dirname, '../**/*.entity.ts')],
  });
  let service: CommunitiesService;
  beforeAll(async () => {
    await (
      db as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    service = new CommunitiesService(db.getRepository(CommunityEntity), db);
    jest
      .spyOn(service, 'assertAccess')
      .mockResolvedValue({ id: 10 } as CommunityEntity);
  });
  afterEach(() => jest.restoreAllMocks());

  it('quotes user aliases and escapes literal search wildcards without selecting credentials', async () => {
    jest
      .spyOn(service, 'assertAccess')
      .mockResolvedValue({ id: 10 } as CommunityEntity);
    const repo = db.getRepository(CommunityMemberEntity);
    const qb = repo.createQueryBuilder('member');
    jest.spyOn(repo, 'createQueryBuilder').mockReturnValue(qb);
    jest.spyOn(qb, 'getManyAndCount').mockResolvedValue([[], 0]);
    const query = Object.assign(new CommunityUsersQuery(), {
      search: "Иван_%'",
    });
    await service.members(10, query, { id: 1 });
    const sql = qb.getSql();
    expect(sql).toContain('"user"."lastName"');
    expect(sql).not.toContain(' user."');
    expect(sql).not.toContain('passwordHash');
    expect(sql).not.toContain('email');
    expect(sql).not.toContain('Иван');
    expect(qb.getParameters().search).toBe("%Иван\\_\\%'%");
    expect(qb.getParameters().id).toBe(10);
  });

  it('searches exact logins/emails using parameters and returns only a public summary', async () => {
    jest
      .spyOn(service, 'assertAccess')
      .mockResolvedValue({ id: 10 } as CommunityEntity);
    const repo = db.getRepository(UserEntity);
    const qb = repo.createQueryBuilder('user');
    jest.spyOn(repo, 'createQueryBuilder').mockReturnValue(qb);
    jest.spyOn(qb, 'getMany').mockResolvedValue([
      {
        id: 2,
        username: 'ivan_1',
        firstName: 'Иван',
        lastName: 'Иванов',
        isActive: true,
        email: 'hidden@example.test',
        passwordHash: 'secret',
      } as UserEntity,
    ]);
    const result = await service.candidates(10, 'ivan_1', { id: 1 });
    expect(qb.getSql()).toContain('LOWER("user"."username") = LOWER($1)');
    expect(qb.getSql()).not.toContain('user."isActive"');
    expect(qb.getSql()).not.toContain('passwordHash');
    expect(qb.getParameters().value).toBe('ivan_1');
    expect(result[0]).not.toHaveProperty('email');
    expect(result[0]).not.toHaveProperty('passwordHash');
  });
});
