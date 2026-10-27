import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ArrowUpRightComponent } from './arrow-up-right.component';

@Component({
    imports: [ArrowUpRightComponent],
    template: `
        <a href="/team" style="color: rgb(214, 255, 63); font-size: 24px">
            Команды <span appArrowUpRight></span>
        </a>
        <i appArrowUpRight style="font-size: 32px"></i>
    `,
})
class ArrowHostComponent {}

describe('Decorative up-right arrow', () => {
    it('renders a vector instead of a Unicode glyph in both supported hosts', () => {
        TestBed.configureTestingModule({ imports: [ArrowHostComponent] });
        const fixture = TestBed.createComponent(ArrowHostComponent);
        fixture.detectChanges();
        const arrows: HTMLElement[] = Array.from(
            fixture.nativeElement.querySelectorAll('[appArrowUpRight]'),
        );
        expect(arrows.length).toBe(2);
        for (const arrow of arrows) {
            const svg = arrow.querySelector('svg')!;
            expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
            expect(svg.querySelector('path')?.getAttribute('stroke')).toBe(
                'currentColor',
            );
            expect(arrow.textContent?.trim()).toBe('');
            expect(arrow.getAttribute('aria-hidden')).toBe('true');
            expect(svg.getAttribute('focusable')).toBe('false');
        }
        expect(
            fixture.nativeElement.querySelector('a').textContent.trim(),
        ).toBe('Команды');
        fixture.destroy();
    });
    it('inherits the link color and scales with the surrounding font', () => {
        TestBed.configureTestingModule({ imports: [ArrowHostComponent] });
        const fixture = TestBed.createComponent(ArrowHostComponent);
        fixture.detectChanges();
        const svg = fixture.nativeElement.querySelector('a svg');
        const largeSvg = fixture.nativeElement.querySelector('i svg');
        expect(getComputedStyle(svg).color).toBe('rgb(214, 255, 63)');
        expect(getComputedStyle(svg).width).toBe('24px');
        expect(getComputedStyle(svg).height).toBe('24px');
        expect(getComputedStyle(largeSvg).width).toBe('32px');
        fixture.destroy();
    });
});
