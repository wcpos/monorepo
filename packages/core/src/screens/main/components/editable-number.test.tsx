/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { EditableNumber } from './editable-number';

// next's Input renders the Uniwind/SVG icon, whose ESM builds jest cannot load.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('../../../contexts/app-state', () => ({ useAppState: () => ({ store: {} }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (store: Record<string, unknown>) => unknown) =>
		select({
			price_decimal_sep: '.',
			price_thousand_sep: ',',
			price_num_decimals: 2,
			thousands_group_style: 'thousand',
		}),
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup() {
	const onChangeText = jest.fn();
	render(
		<EditableNumber
			testID="price"
			value={3.2}
			display="$3.20"
			formatOptions={{ fixedDecimalScale: true }}
			onChangeText={onChangeText}
		/>
	);
	return onChangeText;
}

/** One press on the rest-state text: the field takes its place and focus. */
async function open() {
	fireEvent.click(screen.getByTestId('price'));
	const field = screen.getByTestId('price-field') as HTMLInputElement;
	await act(async () => {
		field.focus();
		jest.runOnlyPendingTimers();
	});
	return field;
}

const atRest = () => screen.queryByTestId('price-field') === null;

it('rests as the cell text and opens to a field holding the raw value', async () => {
	setup();
	expect(screen.getByTestId('price').textContent).toBe('$3.20');
	const field = await open();
	expect(field.value).toBe('3.2');
});

it('Enter commits the typed number once, goes back to rest and hands focus to the price', async () => {
	const onChangeText = setup();
	const field = await open();
	fireEvent.change(field, { target: { value: '4.5' } });
	fireEvent.keyDown(field, { key: 'Enter' });
	// The field's own blur (react-native-web blurs on submit in a timeout) commits and closes.
	await act(async () => jest.runOnlyPendingTimers());

	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(4.5);
	expect(atRest()).toBe(true);
	expect(document.activeElement).toBe(screen.getByTestId('price'));
});

it('a blur with the number unchanged closes and writes nothing', async () => {
	const onChangeText = setup();
	const field = await open();
	await act(async () => field.blur());

	expect(onChangeText).not.toHaveBeenCalled();
	expect(atRest()).toBe(true);
});

it('Escape blurs the field, which closes it and emits nothing', async () => {
	const onChangeText = setup();
	const field = await open();
	fireEvent.change(field, { target: { value: '9' } });
	await act(async () => {
		fireEvent.keyDown(field, { key: 'Escape' });
	});

	expect(onChangeText).not.toHaveBeenCalled();
	expect(atRest()).toBe(true);
	expect(document.activeElement).toBe(screen.getByTestId('price'));
});

it('typing the stored number back writes nothing', async () => {
	const onChangeText = setup();
	const field = await open();
	fireEvent.change(field, { target: { value: '3.20' } });
	await act(async () => field.blur());

	expect(onChangeText).not.toHaveBeenCalled();
	expect(atRest()).toBe(true);
});

it('typing 20 then changing it to unreadable text and leaving writes nothing', async () => {
	const onChangeText = setup();
	const field = await open();
	fireEvent.change(field, { target: { value: '20' } });
	fireEvent.change(field, { target: { value: '99x' } });
	await act(async () => field.blur());

	expect(onChangeText).not.toHaveBeenCalled();
	expect(atRest()).toBe(true);
});
