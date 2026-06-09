import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../../common/base/base-crud.service';
import { RoleEntity } from './entities/role.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleCode } from '../users/enums/role-code.enum';

@Injectable()
export class RolesService extends BaseCrudService<RoleEntity> {
  constructor(
    @InjectRepository(RoleEntity)
    repository: Repository<RoleEntity>,
  ) {
    super(repository, 'Роль');
  }

  findByCode(code: RoleCode) {
    return this.findOne({
      where: {
        code,
      },
    });
  }
}
