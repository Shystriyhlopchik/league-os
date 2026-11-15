import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { SessionStore } from '../entities/user/model/session.store';
import { matchServiceGuard } from './match-service.guard';

describe('Reloading a protected match protocol', () => {
    it('waits for initialization instead of prematurely redirecting a referee', async () => {
        const initialized = signal(false);
        const session = { isInitialized: initialized, isLoading: () => true, init: jasmine.createSpy(),
            hasAnyRole: () => initialized(), canManageCommunityTournaments: () => false };
        const router = { createUrlTree: jasmine.createSpy() };
        TestBed.configureTestingModule({ providers: [{ provide: SessionStore, useValue: session }, { provide: Router, useValue: router }] });
        const result = TestBed.runInInjectionContext(() => matchServiceGuard({} as never, {} as never)) as Observable<boolean>;
        const ready = firstValueFrom(result);
        TestBed.flushEffects();
        expect(router.createUrlTree).not.toHaveBeenCalled();
        initialized.set(true); TestBed.flushEffects();
        expect(await ready).toBeTrue();
    });
});
