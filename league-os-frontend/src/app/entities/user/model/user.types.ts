export interface User {
    id: number;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    roles: string[];
}
