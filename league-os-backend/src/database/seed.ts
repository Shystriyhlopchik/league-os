import { AppDataSource } from './data-source';
import { RoleEntity } from '../modules/roles/entities/role.entity';
import { RoleCode } from '../modules/users/enums/role-code.enum';

const roleNames: Record<RoleCode, string> = {
  [RoleCode.SuperAdmin]: 'Суперадминистратор',
  [RoleCode.Admin]: 'Администратор',
  [RoleCode.Referee]: 'Судья',
  [RoleCode.Captain]: 'Капитан',
  [RoleCode.Player]: 'Игрок',
  [RoleCode.User]: 'Пользователь',
};

async function seed(): Promise<void> {
  await AppDataSource.initialize();

  try {
    await AppDataSource.transaction(async (manager) => {
      const roleRepository = manager.getRepository(RoleEntity);

      for (const code of Object.values(RoleCode)) {
        const existingRole = await roleRepository.findOne({
          where: { code },
        });

        if (existingRole) {
          continue;
        }

        const role = roleRepository.create({
          code,
          name: roleNames[code],
        });

        await roleRepository.save(role);

        console.log(`Created role: ${code}`);
      }
    });

    console.log('Seed completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void seed();