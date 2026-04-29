/**
 * Описание матча в рамках сезона футбольной лиги «Арман».
 */
export interface Match {
    /**
     * Уникальный идентификатор матча.
     *
     * Целое число (авто-инкремент или любое другое целочисленное значение).
     * @example 42
     */
    id: number;
    /**
     * название лиги к которому принадлежит матч.
     *
     * Строка названия лиги.
     * @example "ФИН"
     */
    competitionName: string,
    /**
     * путь до иконки логотипа лиги.
     *
     * Строка пути к иконке.
     * @example "images/logo/fin.png"
     */
    competitionLogoUrl: string,
    /**
     * Название принимающей (домашней) команды.
     *
     * @example "Сятра"
     */
    homeTeamName: string;

    /**
     * URL-адрес логотипа принимающей команды.
     *
     * Формат: относительный или абсолютный путь к изображению.
     * @example "images/teams/syatra.png"
     */
    homeTeamLogoUrl: string;

    /**
     * Число голов, забитых домашней командой.
     * Если матч ещё не состоялся — `null`.
     *
     * @default null
     */
    homeTeamScore: number | null;

    /**
     * Название выездной (гостевой) команды.
     *
     * @example "Шоркино"
     */
    awayTeamName: string;

    /**
     * URL-адрес логотипа выездной команды.
     *
     * @example "images/teams/shorkino.png"
     */
    awayTeamLogoUrl: string;

    /**
     * Число голов, забитых домашней командой.
     * Если матч ещё не состоялся — `null`.
     *
     * @default null
     */
    awayTeamScore: number | null;

    /**
     * Дата и время матча в формате ISO 8601.
     *
     * Для корректного разбора рекомендуется всегда указывать секунды:
     * `"YYYY-MM-DDTHH:mm:ss"`.
     * @example "2025-06-14T18:00:00"
     */
    matchDateTime: string;

    /**
     * Год сезона.
     *
     * @example 2025
     */
    seasonYear: number;

    /**
     * Номер тура/раунда в сезоне.
     *
     * @example 1
     */
    roundNumber: number | string;

    /**
     * Название стадиона или площадки.
     *
     * @example "Стадион «Трёхэтажка»"
     */
    venueName: string;
}
