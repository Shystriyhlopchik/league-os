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
    {
        id: 1,
        name: 'Сятра',
        slug: 'syatra',
        logoUrl: 'images/teams/sytra_logo.svg',
        x: 45,
        y: 51,
        delay: 0,
    },
    {
        id: 2,
        name: 'Сарбаки',
        slug: 'sarbaki',
        logoUrl: 'images/teams/sarbaki.svg',
        x: 25,
        y: 57,
        delay: 0.4,
    },
    {
        id: 3,
        name: 'Побои',
        slug: 'poboi',
        logoUrl: 'images/teams/poboi.svg',
        x: 66,
        y: 5,
        delay: 0.8,
    },
    {
        id: 4,
        name: 'Шоркино',
        slug: 'shorkino',
        logoUrl: 'images/teams/shorkino.png',
        x: 58,
        y: 72,
        delay: 1.2,
    },
];
