import { UserRole } from '../../../entities/user/model/user-role.type';


export interface DashboardAction {
    id?: string;
    title: string;
    description: string;
    route: string;

    roles: UserRole[];

    variant: string;
    feature?: 'tournamentBuilder';
}
