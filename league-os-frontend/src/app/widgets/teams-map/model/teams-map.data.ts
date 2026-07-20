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
];
