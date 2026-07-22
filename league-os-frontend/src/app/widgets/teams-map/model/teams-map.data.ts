export interface TeamsMapMarker {
    id: number;
    name: string;
    slug: string;
    logoUrl: string;
    x: number;
    y: number;
    delay: number;
}

export const TEAMS_MAP_MARKERS: TeamsMapMarker[] = [
    // {
    //     id: 1,
    //     name: 'Сятра',
    //     slug: 'syatra',
    //     logoUrl: 'images/teams/sytra_logo.svg',
    //     x: 45,
    //     y: 51,
    //     delay: 3,
    // },
    // {
    //     id: 2,
    //     name: 'Сарбаки',
    //     slug: 'sarbaki',
    //     logoUrl: 'images/teams/sarbaki.svg',
    //     x: 25,
    //     y: 57,
    //     delay: 1,
    // },
    // {
    //     id: 3,
    //     name: 'Побои',
    //     slug: 'poboi',
    //     logoUrl: 'images/teams/poboi.svg',
    //     x: 66,
    //     y: 10,
    //     delay: 1,
    // },
    // {
    //     id: 4,
    //     name: 'Шоркино',
    //     slug: 'shorkino',
    //     logoUrl: 'images/teams/shorkino.png',
    //     x: 58,
    //     y: 72,
    //     delay: 2,
    // },
    {
        id: 1,
        name: 'Арман',
        slug: 'Arman',
        logoUrl: 'images/teams/Arman_logo.png',
        x: 32,
        y: 96,
        delay: 2,
    },
    {
        id: 2,
        name: 'ЧЭТК',
        slug: 'chetk',
        logoUrl: 'images/teams/CHETK.png',
        x: 43,
        y: 38,
        delay: 2,
    },
    {
        id: 3,
        name: 'FIRE',
        slug: 'fire',
        logoUrl: 'images/teams/fire.png',
        x: 53,
        y: 34,
        delay: 2.3,
    },
    {
        id: 4,
        name: 'Новые Лапсары',
        slug: 'new_lapsary',
        logoUrl: 'images/teams/new-lapsary.webp',
        x: 28,
        y: 78,
        delay: 1.3,
    },
    {
        id: 5,
        name: 'Коробка',
        slug: 'box',
        logoUrl: 'images/teams/box.webp',
        x: 31,
        y: 12,
        delay: 2,
    },
    {
        id: 6,
        name: 'ХБК',
        slug: 'HBK',
        logoUrl: 'images/teams/HBK.webp',
        x: 46,
        y: 15,
        delay: 4,
    },
    {
        id: 7,
        name: 'ЖБК 9',
        slug: 'ZBK9',
        logoUrl: 'images/teams/ZBK9.webp',
        x: 48,
        y: 40,
        delay: 3,
    },
    {
        id: 8,
        name: 'Торпедо',
        slug: 'ZBK9',
        logoUrl: 'images/teams/torpedo.webp',
        x: 47,
        y: 25,
        delay: 3,
    },
];
