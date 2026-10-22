export interface News {
    id: number;
    title: string;
    excerpt?: string | null;
    publishedAt: string | null;
    coverUrl: string | null;
    content: string;
    slug: string;
    status?: 'draft' | 'published';
    createdAt?: string;
    updatedAt?: string;
    authorUserId?: number | null;
    updatedByUserId?: number | null;
}

export interface NewsAdminPage {
    items: News[];
    total: number;
    page: number;
    limit: number;
}

export interface SaveNewsRequest {
    title: string;
    slug?: string;
    excerpt?: string;
    content: string;
    coverUrl?: string;
}
