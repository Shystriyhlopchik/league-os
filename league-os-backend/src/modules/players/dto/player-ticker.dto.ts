export interface PlayerTickerItemDto {
  id: number;
  name: string;
}

export interface PlayerTickerDto {
  date: string;
  players: PlayerTickerItemDto[];
  birthdays: PlayerTickerItemDto[];
}
