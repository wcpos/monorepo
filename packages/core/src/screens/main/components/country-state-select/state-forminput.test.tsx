/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { StateFormInput } from './state-forminput';

// The state control is an Input, a Select or a Combobox by the country's state count. Whichever it
// is, the field's label reference must reach the thing a screen reader focuses: the trigger.
const mockOptionSelect = jest.fn((_props: Record<string, unknown>) => null);
const mockComboboxTrigger = jest.fn((_props: Record<string, unknown>) => null);
const states: Record<string, { name: string; code: string }[]> = {
	// 2 states: a Select. 11 states: a Combobox. None: a plain Input.
	XS: [
		{ name: 'A', code: 'A' },
		{ name: 'B', code: 'B' },
	],
	XM: Array.from({ length: 11 }, (_, i) => ({ name: `S${i}`, code: `S${i}` })),
	XN: [],
};

jest.mock('@wcpos/components/select', () => ({
	OptionSelect: (props: Record<string, unknown>) => mockOptionSelect(props),
}));
jest.mock('@wcpos/components/combobox', () => ({
	Combobox: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	ComboboxTrigger: (props: Record<string, unknown>) => mockComboboxTrigger(props),
	ComboboxValue: () => null,
	ComboboxContent: () => null,
	ComboboxInput: () => null,
	ComboboxList: () => null,
	ComboboxEmpty: () => null,
	ComboboxItem: () => null,
}));
jest.mock('@wcpos/components/input', () => ({
	Input: (props: Record<string, unknown>) => (
		<input aria-labelledby={props['aria-labelledby'] as string} />
	),
}));
jest.mock('../../../../contexts/countries', () => ({
	StatesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useStates: () => states[currentCountry],
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

let currentCountry = 'XS';

describe('StateFormInput', () => {
	beforeEach(() => {
		mockOptionSelect.mockClear();
		mockComboboxTrigger.mockClear();
	});

	it('names the Select trigger by the field label', () => {
		currentCountry = 'XS';
		render(<StateFormInput countryCode="XS" aria-labelledby="state-label" />);
		expect(mockOptionSelect).toHaveBeenCalledWith(
			expect.objectContaining({ 'aria-labelledby': 'state-label' })
		);
	});

	it('names the Combobox trigger by the field label', () => {
		currentCountry = 'XM';
		render(<StateFormInput countryCode="XM" aria-labelledby="state-label" />);
		expect(mockComboboxTrigger).toHaveBeenCalledWith(
			expect.objectContaining({ 'aria-labelledby': 'state-label' })
		);
	});

	it('names the plain Input by the field label', () => {
		currentCountry = 'XN';
		const { container } = render(<StateFormInput countryCode="XN" aria-labelledby="state-label" />);
		expect(container.querySelector('input')?.getAttribute('aria-labelledby')).toBe('state-label');
	});
});
