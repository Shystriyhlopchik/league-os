export interface TeamMember {
    /** Уникальный идентификатор (используется в route) */
    id: string;
    /** ФИО для заголовка карточки */
    fullName: string;
    /** URL фотографии */
    photoUrl: string;
    /** Основное описание/биография */
    bio: string;
    /** Путь для роутинга к детальной странице */
    route: string;
}
