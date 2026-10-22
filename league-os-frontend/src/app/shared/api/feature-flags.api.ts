import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PublicFeatureFlags {
    tournamentBuilder: boolean;
    multiStagePublicView: boolean;
}

@Injectable({ providedIn: 'root' })
export class FeatureFlagsApi {
    private readonly http = inject(HttpClient);
    private readonly flags$ = this.http
        .get<PublicFeatureFlags>(`${environment.apiUrl}/feature-flags`)
        .pipe(
            catchError(() =>
                of({
                    tournamentBuilder: false,
                    multiStagePublicView: false,
                }),
            ),
            shareReplay({ bufferSize: 1, refCount: false }),
        );

    get(): Observable<PublicFeatureFlags> {
        return this.flags$;
    }
}
