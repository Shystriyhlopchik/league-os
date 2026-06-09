import { Column, Entity, ManyToMany } from 'typeorm';

import { UserEntity } from '../../users/entities/user.entity';
import { BaseEntity } from '../../../common/base/base.entity';
import { RoleCode } from '../../users/enums/role-code.enum';

@Entity('roles')
export class RoleEntity extends BaseEntity {
  @Column({
    type: 'enum',
    enum: RoleCode,
    unique: true,
  })
  code: RoleCode;

  @Column()
  name: string;

  @ManyToMany(() => UserEntity, (user) => user.roles)
  users: UserEntity[];
}
