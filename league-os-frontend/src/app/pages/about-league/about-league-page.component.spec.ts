import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';

describe('About league public routes', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideRouter(
                    routes.filter((route) =>
                        ['about', 'regulations'].includes(route.path ?? ''),
                    ),
                ),
            ],
        });
    });

    it('opens philosophy by default and updates the page when navigating to history', async () => {
        const harness = await RouterTestingHarness.create('/about');
        expect(TestBed.inject(Router).url).toBe('/about/philosophy');
        expect(
            harness.routeNativeElement
                ?.querySelector('h1')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim(),
        ).toBe('Дворовая лига. Мы мыслим иначе.');
        expect(harness.routeNativeElement?.textContent).not.toContain(
            'Материал готовится',
        );
        expect(
            harness.routeNativeElement?.querySelector('a[aria-current="page"]')
                ?.textContent,
        ).toBe('Философия');
        await harness.navigateByUrl('/about/history');
        expect(
            harness.routeNativeElement
                ?.querySelector('h1')
                ?.textContent?.trim(),
        ).toBe('История Дворовой лиги.');
        expect(harness.routeNativeElement?.textContent).not.toContain(
            'Материал готовится',
        );
        expect(
            harness.routeNativeElement?.querySelector('article.history'),
        ).not.toBeNull();
        expect(
            harness.routeNativeElement?.querySelector('a[aria-current="page"]')
                ?.textContent,
        ).toBe('История');
    });

    it('publishes the history, named city head and first champion with both supplied photographs', async () => {
        const harness = await RouterTestingHarness.create('/about/history');
        const root = harness.routeNativeElement!;
        const text = root.textContent?.replace(/\s+/g, ' ');
        for (const fact of [
            'Станислава Олеговича Трофимова',
            'на базе третьего дивизиона «Игры народной»',
            'С 2001 года проект «Футбол — игра народная»',
            '21 июля 2026 года',
            'Первый чемпион',
            'Команда «Альгешево»',
            'Иван Фёдоров забил четыре мяча в полуфинале и ещё три — в финале.',
            'Мы создали инициативную группу и судейский комитет.',
            'Начали формировать основу органа, который будет представлять интересы команд.',
            'первая онлайн-трансляция',
            'Мы хотим научиться работать со спонсорами',
            'Отдельное направление — информационные технологии.',
        ]) {
            expect(text).withContext(fact).toContain(fact);
        }
        expect(root.querySelector('#history-numbers-title')?.textContent).toBe(
            'Групповой этап в цифрах',
        );
        expect(
            Array.from(root.querySelectorAll('.history__numbers dd')).map(
                (el) => el.textContent?.trim(),
            ),
        ).toEqual(['16', '70', '250+']);
        const portrait = root.querySelector('.history__portrait img');
        const champion = root.querySelector('.history__team-photo img');
        expect(portrait?.getAttribute('src')).toBe(
            '/brand/photos/history-city-initiative.jpg',
        );
        expect(portrait?.getAttribute('alt')).toContain(
            'Станислав Олегович Трофимов',
        );
        expect(champion?.getAttribute('src')).toBe(
            '/brand/photos/history-algeshevo-2026.jpg',
        );
        expect(champion?.getAttribute('alt')).toContain('первый чемпион');
        expect(champion?.getAttribute('loading')).toBe('lazy');
        expect(root.querySelectorAll('h1').length).toBe(1);
        expect(root.querySelector('.philosophy')).toBeNull();
        expect(
            root.querySelector('.history__closing a[href="/about/philosophy"]'),
        ).not.toBeNull();
        for (const section of Array.from(
            root.querySelectorAll('section[aria-labelledby]'),
        )) {
            expect(
                root.querySelector(
                    `#${section.getAttribute('aria-labelledby')}`,
                ),
            ).not.toBeNull();
        }
        await harness.navigateByUrl('/about/philosophy');
        expect(
            harness.routeNativeElement?.querySelector('.history'),
        ).toBeNull();
        expect(
            harness.routeNativeElement?.querySelector('.philosophy'),
        ).not.toBeNull();
    });

    it('publishes the complete philosophy text with the requested emphasis', async () => {
        const harness = await RouterTestingHarness.create('/about/philosophy');
        const article = harness.routeNativeElement?.querySelector('article');
        const paragraphs = Array.from(
            article?.querySelectorAll(
                '.philosophy__intro, .philosophy__belief h2, .philosophy__belief p, .philosophy__statement, .philosophy__motto',
            ) ?? [],
        ).map((p) => p.textContent?.replace(/\s+/g, ' ').trim());
        expect(paragraphs).toEqual([
            'Во всём, что мы делаем, мы бросаем вызов привычным подходам к организации любительского футбола.',
            'Мы верим, что футбол может быть другим.',
            'Современнее, ярче, доступнее. Что даже дворовые соревнования могут быть организованы на уровне больших спортивных событий.',
            'Мы переосмысливаем привычные форматы, объединяя современный дизайн, информационные технологии и инициативу людей. Мы создаём среду, в которой каждый может проявить себя — не только на футбольном поле, но и за его пределами.',
            'Мы создаём не просто футбольный турнир. Мы создаём сообщество, где идеи становятся реальностью, таланты получают возможность раскрыться, а каждый человек может стать частью чего-то большего.',
            'Дворовая лига. Больше, чем футбол.',
        ]);
        expect(article?.querySelectorAll('strong').length).toBe(4);
    });

    it('explains the benefits for all five audiences without collapsing the content', async () => {
        const harness = await RouterTestingHarness.create('/about/philosophy');
        const root = harness.routeNativeElement!;
        expect(
            root
                .querySelector('#philosophy-community-title')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim(),
        ).toBe(
            '«Дворовая лига» объединяет людей вокруг футбола и создаёт возможности для каждого.',
        );
        const rows = Array.from(root.querySelectorAll('.philosophy__audience'));
        expect(
            rows.map((row) => row.querySelector('h3')?.textContent?.trim()),
        ).toEqual([
            'Для болельщиков:',
            'Для игроков и команд:',
            'Для бизнеса:',
            'Для города:',
            'Для медиа:',
        ]);
        expect(
            rows.map((row) => row.querySelector('p')?.textContent?.trim()),
        ).toEqual([
            'Делаем местный футбол заметным и интересным. Рассказываем о командах и игроках, создаём атмосферу, в которой хочется поддерживать своих — друзей, соседей и свой район.',
            'Создаём условия для регулярных соревнований, спортивного роста и признания. Развиваем удобные цифровые сервисы и привлекаем представителей команд к управлению лигой.',
            'Помогаем стать частью жизни местного сообщества. Предлагаем поддерживать любительский спорт, знакомить жителей со своим брендом и выстраивать доверие через общее увлечение футболом.',
            'Развиваем доступный массовый спорт, объединяем жителей разных районов и вовлекаем молодёжь в активную жизнь. Создаём площадку, где инициатива жителей получает поддержку и превращается в общее дело.',
            'Открываем истории местных игроков, команд и энтузиастов. Делимся яркими моментами матчей и показываем, как дворовый футбол становится заметной частью спортивной жизни города.',
        ]);
        for (const row of rows) {
            expect(row.getAttribute('aria-labelledby')).toBe(
                row.querySelector('h3')?.id ?? null,
            );
        }
        expect(root.querySelectorAll('h1').length).toBe(1);
        expect(root.querySelector('main')).toBeNull();
        const photo = root.querySelector('.philosophy__photo img');
        expect(photo?.getAttribute('alt')).toBeTruthy();
        expect(photo?.getAttribute('src')).toBe(
            '/brand/photos/philosophy-match.jpg',
        );
        expect(
            root.querySelector('.philosophy__actions a[href="/matches"]'),
        ).not.toBeNull();
        expect(
            root.querySelector('.philosophy__actions a[href="/news"]'),
        ).not.toBeNull();
    });

    it('preserves the existing regulations URL and content', async () => {
        const harness = await RouterTestingHarness.create('/regulations');
        expect(
            harness.routeNativeElement?.querySelector('h1')?.textContent,
        ).toBe('Регламент соревнований');
        expect(
            harness.routeNativeElement?.querySelector('#format'),
        ).not.toBeNull();
    });
});
