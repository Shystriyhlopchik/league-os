export function formatLocalDateTime(date?: Date | null): string | null {
    if (!date) {
        return null;
    }

    const pad = (value: number) => String(value).padStart(2, '0');

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join('-') + 'T' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join(':');
}