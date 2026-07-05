import {
    CanActivate,
    ExecutionContext,
    Injectable,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>(
            ROLES_KEY,
            [
                context.getHandler(),
                context.getClass(),
            ],
        );

        if (!requiredRoles?.length) {
            return true;
        }

        const request = context.switchToHttp().getRequest();

        const user = request.user;

        if (!user?.roles?.length) {
            return false;
        }

        const userRoles = user.roles.map((role: any) => {
            return typeof role === 'string' ? role : role.code;
        });

        return requiredRoles.some((role) =>
            userRoles.includes(role),
        );
    }
}
