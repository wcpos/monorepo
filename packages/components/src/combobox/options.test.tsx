/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { OptionsCombobox } from './options';

/**
 * The parts are stubs drawing what they were handed: the test pins which control a list
 * gets, the testIDs, and the scalar that comes back, not the popover.
 */
type Option = { value: string; label: string };
const mockOptionSelect = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('../select', () => ({
	OptionSelect: (props: Record<string, unknown>) => mockOptionSelect(props),
}));
jest.mock('./combobox', () => {
	const R = require('react');
	const Ctx = R.createContext(null);
	const part =
		(tag: string) =>
		({ children, testID, placeholder }: Record<string, any>) =>
			R.createElement(tag, { 'data-testid': testID, 'data-placeholder': placeholder }, children);
	return {
		Combobox: ({ value, onValueChange, children }: Record<string, any>) =>
			R.createElement(
				Ctx.Provider,
				{ value: onValueChange },
				R.createElement('div', { 'data-testid': 'root', 'data-label': value.label }, children)
			),
		ComboboxTrigger: part('button'),
		ComboboxValue: part('span'),
		ComboboxContent: part('section'),
		ComboboxInput: part('input'),
		ComboboxEmpty: part('p'),
		ComboboxItemText: () => null,
		ComboboxItem: ({ testID, value, label }: Record<string, any>) => {
			const pick = R.useContext(Ctx);
			return R.createElement('button', {
				'data-testid': testID,
				onClick: () => pick({ value, label }),
			});
		},
		ComboboxList: ({ data, renderItem, ListEmptyComponent }: Record<string, any>) =>
			R.createElement(
				'ul',
				null,
				data.map((item: Option) =>
					R.createElement(R.Fragment, { key: item.value }, renderItem({ item }))
				),
				ListEmptyComponent
			),
	};
});

const list = (n: number): Option[] =>
	Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Label ${i}` }));

function draw(options: Option[], onChange = jest.fn()) {
	render(
		<OptionsCombobox
			options={options}
			value="v3"
			onChange={onChange}
			placeholder="Pick one"
			searchPlaceholder="Search"
			emptyLabel="Nothing found"
			triggerTestID="thing"
		/>
	);
	return onChange;
}

beforeEach(() => mockOptionSelect.mockClear());

it('draws ten options or fewer as the OptionSelect, with the same props', () => {
	draw(list(10));
	expect(mockOptionSelect).toHaveBeenCalledWith(
		expect.objectContaining({ options: list(10), value: 'v3', triggerTestID: 'thing' })
	);
	expect(mockOptionSelect.mock.calls[0][0]).not.toHaveProperty('searchPlaceholder');
	expect(screen.queryByTestId('root')).toBeNull();
});

it("draws more as a search with OptionSelect's testIDs, and hands back the scalar", () => {
	const onChange = draw(list(11));
	expect(mockOptionSelect).not.toHaveBeenCalled();
	expect(screen.getByTestId('root')).toHaveAttribute('data-label', 'Label 3');
	expect(screen.getByTestId('thing')).toBeTruthy();
	expect(screen.getByTestId('thing-content')).toBeTruthy();
	expect(screen.getByText('Nothing found')).toBeTruthy();
	fireEvent.click(screen.getByTestId('thing-option-v10'));
	expect(onChange).toHaveBeenCalledWith('v10', { value: 'v10', label: 'Label 10' });
});
