import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base/base.entity';
import { RoleEntity } from "../../roles/entities/role.entity";

@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({
    unique: true,
  })
  email: string;

  @Column({
    unique: true,
  })
  username: string;

  @Column()
  passwordHash: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({
    nullable: true,
  })
  middleName?: string;

  @Column({
    nullable: true,
  })
  avatarUrl?: string;

  @Column({
    nullable: true,
  })
  phone?: string;

  @Column({
    default: true,
  })
  isActive: boolean;

  @ManyToMany(() => RoleEntity)
  @JoinTable({
    name: 'user_roles',
  })
  roles: RoleEntity[];
}
