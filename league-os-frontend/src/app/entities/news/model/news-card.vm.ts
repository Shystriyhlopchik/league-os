export interface NewsCardVm {
    id: number | string;
    title: string;
    date: string | Date;
    imageUrl: string;
    imageAlt?: string;
    url?: string;
}
