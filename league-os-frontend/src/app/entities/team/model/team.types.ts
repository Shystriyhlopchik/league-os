export interface Team {
    id: number;
    name: string;
    shortName?: string | null;
    slug: string;
    description?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    city?: string | null;
    village?: string | null;
    foundedYear?: number | null;
    isActive: boolean;
}
