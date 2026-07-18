import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectComponent } from './select.component';

describe('SelectComponent', () => {
    let fixture: ComponentFixture<SelectComponent<number>>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SelectComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(SelectComponent<number>);
        fixture.componentRef.setInput('options', [
            { value: 1, label: 'Группа А' },
            { value: 2, label: 'Группа Б' },
            { value: 3, label: 'Группа В', disabled: true },
        ]);
        fixture.componentRef.setInput('label', 'Группа');
        fixture.detectChanges();
    });

    it('renders the small variant by default', () => {
        expect(
            fixture.nativeElement.querySelector('.select-field--small'),
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('select')).toBeNull();
    });

    it('renders the large variant', () => {
        fixture.componentRef.setInput('size', 'large');
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('.select-field--large'),
        ).not.toBeNull();
    });

    it('emits the original numeric value when an option is selected', () => {
        const selected: Array<number | null> = [];
        fixture.componentInstance.valueChange.subscribe((value) =>
            selected.push(value),
        );
        const trigger = fixture.nativeElement.querySelector(
            '.select-field__trigger',
        ) as HTMLButtonElement;
        trigger.click();
        fixture.detectChanges();
        const options = fixture.nativeElement.querySelectorAll(
            '.select-field__option',
        ) as NodeListOf<HTMLButtonElement>;
        expect(options.length).toBe(3);
        options[1].click();
        fixture.detectChanges();

        expect(selected).toEqual([2]);
        expect(fixture.componentInstance.selectedValue()).toBe(2);
    });

    it('supports disabled state from Angular forms', () => {
        fixture.componentInstance.setDisabledState(true);
        fixture.detectChanges();

        const trigger = fixture.nativeElement.querySelector(
            '.select-field__trigger',
        ) as HTMLButtonElement;
        expect(trigger.disabled).toBeTrue();
    });

    it('opens a custom listbox without a native selection highlight', () => {
        const trigger = fixture.nativeElement.querySelector(
            '.select-field__trigger',
        ) as HTMLButtonElement;

        trigger.click();
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('[role="listbox"]'),
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('select')).toBeNull();
    });
});
