import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    forwardRef,
    HostListener,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
    SelectOption,
    SelectOptionValue,
    SelectSize,
} from './select-option.model';

let nextSelectId = 0;

@Component({
    selector: 'app-select',
    imports: [],
    templateUrl: './select.component.html',
    styleUrl: './select.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => SelectComponent),
            multi: true,
        },
    ],
})
export class SelectComponent<T extends SelectOptionValue = string>
    implements ControlValueAccessor
{
    readonly options = input.required<readonly SelectOption<T>[]>();
    readonly value = input<T | null>(null);
    readonly valueChange = output<T | null>();

    readonly label = input<string>();
    readonly placeholder = input<string>('Выберите значение');
    readonly size = input<SelectSize>('small');
    readonly disabled = input(false);
    readonly required = input(false);
    readonly hint = input<string>();
    readonly error = input<string>();
    readonly selectId = input(`app-select-${++nextSelectId}`);
    readonly ariaLabel = input<string>();
    readonly usePlaceholder = input<boolean>(false);

    readonly selectedValue = signal<T | null>(null);
    readonly formDisabled = signal(false);
    readonly isOpen = signal(false);
    readonly activeIndex = signal(-1);
    readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

    readonly isDisabled = computed(
        () => this.disabled() || this.formDisabled(),
    );
    readonly selectedOption = computed(() =>
        this.options().find((option) => option.value === this.selectedValue()),
    );
    readonly displayLabel = computed(
        () =>
            this.selectedOption()?.label ??
            (!this.usePlaceholder()
                ? this.options().find((option) => !option.disabled)?.label
                : undefined) ??
            this.placeholder(),
    );

    private readonly host = inject(ElementRef<HTMLElement>);

    private onChange: (value: T | null) => void = () => undefined;
    private onTouched: () => void = () => undefined;

    constructor() {
        effect(() => this.selectedValue.set(this.value()));
    }

    toggle(): void {
        if (this.isDisabled()) return;
        if (this.isOpen()) {
            this.close();
            return;
        }
        this.open();
    }

    selectOption(option: SelectOption<T>): void {
        if (option.disabled) return;
        this.selectedValue.set(option.value);
        this.valueChange.emit(option.value);
        this.onChange(option.value);
        this.onTouched();
        this.close(true);
    }

    handleKeydown(event: KeyboardEvent): void {
        if (this.isDisabled()) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!this.isOpen()) {
                this.open();
                return;
            }
            const option = this.options()[this.activeIndex()];
            if (option) this.selectOption(option);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!this.isOpen()) {
                this.open();
                return;
            }
            this.moveActive(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Escape' && this.isOpen()) {
            event.preventDefault();
            this.close(true);
        }
    }

    markAsTouched(): void {
        this.onTouched();
    }

    writeValue(value: T | null): void {
        this.selectedValue.set(value ?? null);
    }

    registerOnChange(callback: (value: T | null) => void): void {
        this.onChange = callback;
    }

    registerOnTouched(callback: () => void): void {
        this.onTouched = callback;
    }

    setDisabledState(disabled: boolean): void {
        this.formDisabled.set(disabled);
        if (disabled) this.close();
    }

    optionId(index: number): string {
        return `${this.selectId()}-option-${index}`;
    }

    @HostListener('document:pointerdown', ['$event'])
    closeOnOutsideClick(event: PointerEvent): void {
        if (
            this.isOpen() &&
            !this.host.nativeElement.contains(event.target as Node)
        ) {
            this.onTouched();
            this.close();
        }
    }

    private open(): void {
        this.isOpen.set(true);
        const selectedIndex = this.options().findIndex(
            (option) =>
                option.value === this.selectedValue() && !option.disabled,
        );
        this.activeIndex.set(
            selectedIndex >= 0 ? selectedIndex : this.nextEnabledIndex(-1, 1),
        );
    }

    private close(focusTrigger = false): void {
        this.isOpen.set(false);
        this.activeIndex.set(-1);
        if (focusTrigger) {
            queueMicrotask(() => this.trigger()?.nativeElement.focus());
        }
    }

    private moveActive(direction: 1 | -1): void {
        const nextIndex = this.nextEnabledIndex(this.activeIndex(), direction);
        if (nextIndex >= 0) this.activeIndex.set(nextIndex);
    }

    private nextEnabledIndex(start: number, direction: 1 | -1): number {
        const options = this.options();
        if (!options.length) return -1;
        for (let offset = 1; offset <= options.length; offset += 1) {
            const index =
                (start + direction * offset + options.length) % options.length;
            if (!options[index].disabled) return index;
        }
        return -1;
    }
}
