import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A decorative arrow drawn as SVG: never substituted with an OS emoji font. */
@Component({
    selector: 'span[appArrowUpRight], i[appArrowUpRight]',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { 'aria-hidden': 'true' },
    template: `
        <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <path
                d="M5 19 19 5M5 5h14v14"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="square"
                stroke-linejoin="miter"
            />
        </svg>
    `,
    styles: `
        :host {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            line-height: 1;
            vertical-align: middle;
        }
        svg {
            display: block;
            width: 1em;
            height: 1em;
        }
    `,
})
export class ArrowUpRightComponent {}
