import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ArrowUpRightComponent } from '../../shared/ui/arrow-up-right/arrow-up-right.component';
import { LeagueHistoryComponent } from './league-history.component';

@Component({
    selector: 'app-about-league-page',
    imports: [
        RouterLink,
        RouterLinkActive,
        ArrowUpRightComponent,
        LeagueHistoryComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './about-league-page.component.html',
    styleUrl: './about-league-page.component.scss',
})
export class AboutLeaguePageComponent {
    private readonly route = inject(ActivatedRoute);
    readonly page = toSignal(this.route.data, {
        initialValue: this.route.snapshot.data,
    });
    readonly audiences = [
        {
            id: 'fans',
            number: '01',
            title: 'Для болельщиков',
            text: 'Делаем местный футбол заметным и интересным. Рассказываем о командах и игроках, создаём атмосферу, в которой хочется поддерживать своих — друзей, соседей и свой район.',
        },
        {
            id: 'players',
            number: '02',
            title: 'Для игроков и команд',
            text: 'Создаём условия для регулярных соревнований, спортивного роста и признания. Развиваем удобные цифровые сервисы и привлекаем представителей команд к управлению лигой.',
        },
        {
            id: 'business',
            number: '03',
            title: 'Для бизнеса',
            text: 'Помогаем стать частью жизни местного сообщества. Предлагаем поддерживать любительский спорт, знакомить жителей со своим брендом и выстраивать доверие через общее увлечение футболом.',
        },
        {
            id: 'city',
            number: '04',
            title: 'Для города',
            text: 'Развиваем доступный массовый спорт, объединяем жителей разных районов и вовлекаем молодёжь в активную жизнь. Создаём площадку, где инициатива жителей получает поддержку и превращается в общее дело.',
        },
        {
            id: 'media',
            number: '05',
            title: 'Для медиа',
            text: 'Открываем истории местных игроков, команд и энтузиастов. Делимся яркими моментами матчей и показываем, как дворовый футбол становится заметной частью спортивной жизни города.',
        },
    ];
}
