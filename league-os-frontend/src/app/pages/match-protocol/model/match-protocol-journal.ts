import { Injectable } from '@angular/core';
import {
    MatchCommand,
    MatchProtocolData,
} from '../../../entities/match-service/model/match-service.types';

export interface ProtocolJournal {
    key: string;
    confirmed: MatchProtocolData;
    pending: MatchCommand[];
    /** Confirmed online reset, retained verbatim until the server acknowledges it. */
    resetCommand?: MatchCommand;
}

@Injectable({ providedIn: 'root' })
export class MatchProtocolJournal {
    private database?: Promise<IDBDatabase>;
    private db(): Promise<IDBDatabase> {
        return (this.database ??= new Promise((resolve, reject) => {
            const request = indexedDB.open('league-match-protocol', 1);
            request.onupgradeneeded = () =>
                request.result.createObjectStore('journals', {
                    keyPath: 'key',
                });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }));
    }
    async read(key: string): Promise<ProtocolJournal | undefined> {
        const db = await this.db();
        return new Promise((resolve, reject) => {
            const request = db
                .transaction('journals')
                .objectStore('journals')
                .get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    async save(value: ProtocolJournal): Promise<void> {
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('journals', 'readwrite');
            tx.objectStore('journals').put(structuredClone(value));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () =>
                reject(tx.error ?? new Error('Не удалось сохранить журнал'));
        });
    }
}
