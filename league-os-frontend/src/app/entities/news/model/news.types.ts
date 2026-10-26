export interface News {
    communityId?: number;
    slugLocked?: boolean;
    vkTitle?: string | null;
    vkText?: string | null;
    vkImageUrl?: string | null;
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
    communityId?: number;
    vkTitle?: string;
    vkText?: string;
    vkImageUrl?: string;
    title: string;
    slug?: string;
    excerpt?: string;
    content: string;
    coverUrl?: string;
}

export interface VkConnection {
    configured: boolean;
    groupId: string | null;
    groupUrl: string | null;
    name?: string;
    message?: string;
    tokenType?: 'community' | 'user';
    publicationVerified?: boolean;
}

export interface NewsPublication {
    id: number;
    status: 'queued' | 'sending' | 'published' | 'failed' | 'unknown';
    message: string;
    imageUrl: string | null;
    articleUrl: string;
    postUrl: string | null;
    errorMessage: string | null;
    publishedAt: string | null;
    attempts: number;
}
