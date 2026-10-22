import { AppDataSource } from './data-source';
import { CommunityEntity } from '../modules/communities/entities/community.entity';
import {
  CommunityMemberEntity,
  CommunityRole,
} from '../modules/communities/entities/community-member.entity';
import { CommunityAccessAuditEntity } from '../modules/communities/entities/community-access-audit.entity';
import { UserEntity } from '../modules/users/entities/user.entity';

async function main() {
  const args = process.argv.slice(2);
  const slug = args[args.indexOf('--community') + 1];
  const username = args[args.indexOf('--user') + 1];
  if (
    !args.includes('--community') ||
    !args.includes('--user') ||
    !slug ||
    !username
  ) {
    throw new Error(
      'Usage: npm run community:owner -- --community dvorovaya-liga --user EXACT_USERNAME',
    );
  }
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const community = await manager.getRepository(CommunityEntity).findOne({
        where: { slug, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!community)
        throw new Error('Сообщество не найдено; сначала выполните миграции');
      const user = await manager
        .getRepository(UserEntity)
        .findOneBy({ username, isActive: true });
      if (!user)
        throw new Error(
          'Активный пользователь с таким точным логином не найден',
        );
      const repo = manager.getRepository(CommunityMemberEntity);
      const current = await repo.findOneBy({
        communityId: community.id,
        userId: user.id,
      });
      if (current?.isActive && current.role === CommunityRole.Owner) {
        console.log('Пользователь уже является владельцем сообщества');
        return;
      }
      await repo.save(
        repo.create({
          ...current,
          communityId: community.id,
          userId: user.id,
          role: CommunityRole.Owner,
          isActive: true,
        }),
      );
      await manager.getRepository(CommunityAccessAuditEntity).save({
        communityId: community.id,
        actorUserId: null,
        targetUserId: user.id,
        previousRole: current?.isActive ? current.role : null,
        newRole: CommunityRole.Owner,
        source: 'server-command',
      });
      console.log(
        `Назначен владелец сообщества «${community.name}»: ${user.username}`,
      );
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Не удалось назначить владельца',
  );
  process.exitCode = 1;
});
