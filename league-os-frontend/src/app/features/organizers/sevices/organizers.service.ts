import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { TeamMember } from '../components/profile-card/team-member.model';

const TEAM_MEMBERS: TeamMember[] = [
    {
        id: 'dmitriy-stepanov',
        fullName: 'Димитрий Степанов',
        photoUrl: 'images/organization-team/dmitriy-stepanov.png',
        bio: 'Организую матчи и всё, что с ними связано — от судей до эмоций болельщиков.',
        route: '/about/team/dmitriy-stepanov',
    },
    {
        id: 'andrey-illarinov',
        fullName: 'Андрей Илларионов',
        photoUrl: 'images/organization-team/andrey-illarinov.png',
        bio: 'Задаю формат соревнований, чтобы каждый матч был честным и захватывающим.',
        route: '/about/team/andrey-illarinov',
    },
    {
        id: 'vasilev-leonid',
        fullName: 'Васильев Леонид',
        photoUrl: 'images/organization-team/not-photo.png',
        bio: 'Забочусь о поле: ровный газон, чёткие линии — чтобы играть было в удовольствие.',
        route: '/about/team/vasilev-leonid',
    },
    {
        id: 'spiridonov-evgeniy',
        fullName: 'Спиридонов Евгений',
        photoUrl: 'images/organization-team/not-photo.png',
        bio: 'Вместе с Леонидом делаю поле идеальным. Мы за качество, которое видно каждому.',
        route: '/about/team/spiridonov-evgeniy',
    },
    {
        id: 'alina-grigoreva',
        fullName: 'Алина Григорьева',
        photoUrl: 'images/organization-team/alina-grigoreva.png',
        bio: 'Делаю так, чтобы ваши голы и эмоции остались в памяти.',
        route: '/about/team/alina-grigoreva',
    },
    {
        id: 'andreev-dimitriy',
        fullName: 'Андреев Димитрий',
        photoUrl: 'images/organization-team/andreev-dimitriy.png',
        bio: 'Отвечаю за сайт и соцсети — делаю так, чтобы лига жила и в онлайне.',
        route: '/about/team/andreev-dimitriy',
    },
];

@Injectable({
    providedIn: 'root',
})
export class OrganizersService {
    team$ = of(TEAM_MEMBERS);
    constructor() {}
}
