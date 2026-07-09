import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {CreateTeamPlayerDto, TeamPlayer} from '../model/team-player.types';

@Injectable({
    providedIn: 'root',
})
export class TeamPlayersApi {
    private readonly http = inject(HttpClient);

    getByTeam(teamId: number): Observable<TeamPlayer[]> {
        return this.http.get<TeamPlayer[]>(
            `${environment.apiUrl}/teams/${teamId}/players`,
        );
    }
    create(teamId: number, dto: CreateTeamPlayerDto): Observable<TeamPlayer> {
        const url = `${environment.apiUrl}/teams/${teamId}/players`;

        return this.save(url, dto, 'post');
    }

    update(
        teamId: number,
        teamPlayerId: number,
        dto: CreateTeamPlayerDto,
    ): Observable<TeamPlayer> {
        const url = `${environment.apiUrl}/teams/${teamId}/players/${teamPlayerId}`;

        return this.save(url, dto, 'patch');
    }

    private save(
        url: string,
        dto: CreateTeamPlayerDto,
        method: 'post' | 'patch',
    ): Observable<TeamPlayer> {
        if (!dto.photo) {
            const body = {
                firstName: dto.firstName,
                lastName: dto.lastName,
                middleName: dto.middleName,
                shirtNumber: dto.shirtNumber,
                position: dto.position,
                birthDate: dto.birthDate,
                preferredFoot: dto.preferredFoot,
                isCaptain: dto.isCaptain,
            };

            return method === 'post'
                ? this.http.post<TeamPlayer>(url, body)
                : this.http.patch<TeamPlayer>(url, body);
        }

        const formData = new FormData();
        formData.append('firstName', dto.firstName);
        formData.append('lastName', dto.lastName);
        formData.append('isCaptain', String(dto.isCaptain ?? false));
        formData.append('photo', dto.photo, dto.photo.name);

        this.appendOptionalField(formData, 'middleName', dto.middleName);
        this.appendOptionalField(formData, 'shirtNumber', dto.shirtNumber);
        this.appendOptionalField(formData, 'position', dto.position);
        this.appendOptionalField(formData, 'birthDate', dto.birthDate);
        this.appendOptionalField(formData, 'preferredFoot', dto.preferredFoot);

        return method === 'post'
            ? this.http.post<TeamPlayer>(url, formData)
            : this.http.patch<TeamPlayer>(url, formData);
    }

    private appendOptionalField(
        formData: FormData,
        name: string,
        value: string | number | null | undefined,
    ): void {
        if (value !== null && value !== undefined && value !== '') {
            formData.append(name, String(value));
        }
    }
}
