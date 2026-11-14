/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { StateFormInput } from './state-forminput';

// The state control is a list when the country has states (OptionsCombobox decides Select or
// searchable) and a plain Input when it has none. Either way the field's label reference reaches
// the control, and the field holds the state's code.
const mockOptionsCombobox = jest.fn((_props: Record<string, unknown>) => null);
const states: Record<string, { name: string; code: string }[]> = {
	XS: [
		{ name: 'Alpha', code: 'A' },
		{ name: 'Beta', code: 'B' },
	],
	XN: [],
};

jest.mock('@wcpos/components/combobox', () => ({
	OptionsCombobox: (props: Record<string, unknown>) => mockOptionsCombobox(props),
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
	beforeEach(() => mockOptionsCombobox.mockClear());

	it("draws the country's states, named by the field label, and writes the code", () => {
		currentCountry = 'XS';
		const onChangeText = jest.fn();
		render(
			<StateFormInput
				countryCode="XS"
				value="B"
				onChangeText={onChangeText}
				aria-labelledby="state-label"
			/>
		);
		const props = mockOptionsCombobox.mock.calls[0][0] as {
			options: unknown;
			value: string;
			onChange: (next: string | undefined) => void;
		};
		expect(props).toEqual(
			expect.objectContaining({
				'aria-labelledby': 'state-label',
				triggerTestID: 'state-select',
				value: 'B',
				options: [
					{ label: 'Alpha', value: 'A' },
					{ label: 'Beta', value: 'B' },
				],
			})
		);
		props.onChange('A');
		props.onChange(undefined);
		expect(onChangeText.mock.calls).toEqual([['A'], ['']]);
	});

	it('names the plain Input by the field label', () => {
		currentCountry = 'XN';
		const { container } = render(<StateFormInput countryCode="XN" aria-labelledby="state-label" />);
		expect(container.querySelector('input')?.getAttribute('aria-labelledby')).toBe('state-label');
		expect(mockOptionsCombobox).not.toHaveBeenCalled();
	});
});
