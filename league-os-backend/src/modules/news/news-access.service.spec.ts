import { DataSource, Repository } from 'typeorm';
import { CommunitiesService } from '../communities/communities.service';
import { CommunityEntity } from '../communities/entities/community.entity';
import { CommunityMemberEntity } from '../communities/entities/community-member.entity';
import { NewsEntity } from './entities/news.entity';
import { NewsAccessService } from './news-access.service';

describe('News community access', () => {
  let access: NewsAccessService;
  beforeEach(() => {
    const community = {
      findOneBy: jest.fn(async (where) => ({
        id: where.id ?? 7,
        isActive: true,
      })),
    };
    const membership = {
      findOneBy: jest.fn(async (where) =>
        where.communityId === 7 && where.userId === 12
          ? { role: 'admin' }
          : null,
      ),
    };
    const news = {
      findOneBy: jest.fn(async ({ id }) =>
        id === 1
          ? { id, communityId: 7 }
          : id === 2
            ? { id, communityId: 8 }
            : null,
      ),
    };
    const getRepository = (entity: unknown) =>
      entity === NewsEntity
        ? news
        : entity === CommunityMemberEntity
          ? membership
          : community;
    const db = {
      getRepository,
      manager: { getRepository },
    } as unknown as DataSource;
    const communities = new CommunitiesService(
      community as unknown as Repository<CommunityEntity>,
      db,
    );
    access = new NewsAccessService(db, communities);
  });

  it('allows a community admin without global roles', async () => {
    await expect(
      access.article(1, { id: 12, roles: [] }),
    ).resolves.toMatchObject({ communityId: 7 });
    await expect(access.community(undefined, { id: 12 })).resolves.toBe(7);
  });
  it('does not grant a global admin access without community membership', async () => {
    await expect(
      access.article(1, { id: 99, roles: ['admin'] }),
    ).rejects.toThrow('Недостаточно прав');
  });
  it('rejects cross-community article access even for another community admin', async () => {
    await expect(access.article(2, { id: 12 })).rejects.toThrow(
      'Недостаточно прав',
    );
  });
  it('allows a platform superadmin and returns 404 for missing articles', async () => {
    await expect(
      access.article(2, { id: 99, roles: ['super_admin'] }),
    ).resolves.toMatchObject({ communityId: 8 });
    await expect(
      access.article(99, { id: 99, roles: ['super_admin'] }),
    ).rejects.toThrow('Новость не найдена');
  });
});
