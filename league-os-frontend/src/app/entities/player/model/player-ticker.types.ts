export interface PlayerTickerItem {
    id: number;
    name: string;
}

export interface PlayerTicker {
    date: string;
    players: PlayerTickerItem[];
    birthdays: PlayerTickerItem[];
}
