export interface NewsCardVm {
    id: number | string;
    slug: string;
    title: string;
    date: string | Date;
    imageUrl: string;
    imageAlt?: string;
}
