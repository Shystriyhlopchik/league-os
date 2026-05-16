export interface NewsCardVm {
    id: number | string;
    slug: string;

    title: string;
    publishedAt: string | Date;

    imageUrl: string | null;
    imageAlt: string | null;
}
