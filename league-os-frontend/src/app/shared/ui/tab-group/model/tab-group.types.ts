export interface TabGroupItem<TValue extends string = string> {
    label: string;
    value: TValue;
    disabled?: boolean;
}
