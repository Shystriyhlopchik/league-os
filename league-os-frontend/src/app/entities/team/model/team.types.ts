export interface Team {
    id: number;
    name: string;
    shortName?: string | null;
    slug: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    city?: string | null;
    village?: string | null;
    isActive: boolean;
}
