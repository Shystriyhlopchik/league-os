export interface NewsDetailVm {
    id: number | string;
    title: string;
    content: string;
    publishedAt: string | Date;
    imageUrl?: string | null;
    imageAlt?: string | null;
}
