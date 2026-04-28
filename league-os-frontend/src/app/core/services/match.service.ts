import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { matches } from './constants';

@Injectable({
    providedIn: 'root',
})
export class MatchService {
    matches$ = of(matches);
    constructor() {}
}
