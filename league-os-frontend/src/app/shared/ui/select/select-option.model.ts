export type SelectOptionValue = string | number;

export interface SelectOption<T extends SelectOptionValue = string> {
    value: T;
    label: string;
    disabled?: boolean;
}

export type SelectSize = 'large' | 'small';
