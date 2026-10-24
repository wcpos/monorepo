/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { EditableNumber } from './editable-number';

// next's Input and Chip render the Uniwind/SVG icon, whose ESM builds jest cannot load.
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

function setup(discounts?: number[]) {
	const onChangeText = jest.fn();
	render(
		<EditableNumber
			testID="price"
			value={3.2}
			display="$3.20"
			formatOptions={{ fixedDecimalScale: true }}
			discounts={discounts}
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

it('a quick-discount chip discounts the typed number, once, at the store places', async () => {
	const onChangeText = setup([5, 10]);
	const field = await open();
	expect(screen.getByTestId('price-discount-5-label').textContent).toBe('−5%');
	fireEvent.change(field, { target: { value: '20' } });
	await act(async () => {
		fireEvent.click(screen.getByTestId('price-discount-10'));
	});

	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(18);
	expect(atRest()).toBe(true);
});

it('Tab from the field to a chip keeps the editor open; Enter on the chip commits once', async () => {
	const onChangeText = setup([10]);
	const field = await open();
	fireEvent.change(field, { target: { value: '20' } });
	const chip = screen.getByTestId('price-discount-10');
	// Focus moves from the field to the chip, as Tab does: the field's blur names the chip.
	await act(async () => chip.focus());

	expect(document.activeElement).toBe(chip);
	expect(screen.getByTestId('price-field')).toBeTruthy();
	expect(onChangeText).not.toHaveBeenCalled();

	// The chip renders a <button>: react-native-web leaves Enter to the browser, which clicks
	// it. jsdom does not, so the click is the browser's half of the key press.
	await act(async () => {
		fireEvent.keyDown(chip, { key: 'Enter' });
		fireEvent.keyUp(chip, { key: 'Enter' });
		fireEvent.click(chip);
	});
	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(18);
	expect(atRest()).toBe(true);
});

it('Tab on past the chips commits what was typed, once', async () => {
	const onChangeText = setup([10]);
	const field = await open();
	fireEvent.change(field, { target: { value: '7' } });
	const chip = screen.getByTestId('price-discount-10');
	await act(async () => chip.focus());
	await act(async () => chip.blur());

	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(7);
	expect(atRest()).toBe(true);
});

it('Shift+Tab back from a chip shows the draft, and Tab past the chips commits it once', async () => {
	const onChangeText = setup([10]);
	const field = await open();
	fireEvent.change(field, { target: { value: '20' } });
	const chip = screen.getByTestId('price-discount-10');
	await act(async () => chip.focus());
	await act(async () => field.focus());

	expect(screen.getByTestId('price-field')).toBe(field);
	expect(field.value).toBe('20');
	expect(onChangeText).not.toHaveBeenCalled();

	await act(async () => chip.focus());
	await act(async () => chip.blur());
	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(20);
	expect(atRest()).toBe(true);
});

it('Shift+Tab back from a chip and typing on commits the final number once', async () => {
	const onChangeText = setup([10]);
	const field = await open();
	fireEvent.change(field, { target: { value: '20' } });
	await act(async () => screen.getByTestId('price-discount-10').focus());
	await act(async () => field.focus());
	fireEvent.change(field, { target: { value: '205' } });
	await act(async () => field.blur());

	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(205);
});

it('typing the stored number back writes nothing; a re-focus alone is not typing', async () => {
	const onChangeText = setup([10]);
	const field = await open();
	fireEvent.change(field, { target: { value: '3.20' } });
	await act(async () => screen.getByTestId('price-discount-10').focus());
	await act(async () => field.focus());
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

it('a cleared field is 0 to a chip: −10% writes 0, not the stored price discounted', async () => {
	const onChangeText = setup([10]);
	const field = await open();
	fireEvent.change(field, { target: { value: '' } });
	await act(async () => {
		fireEvent.click(screen.getByTestId('price-discount-10'));
	});

	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(0);
});

it('Escape on a chip cancels: nothing written, closed, focus back on the price', async () => {
	const onChangeText = setup([10]);
	const field = await open();
	fireEvent.change(field, { target: { value: '20' } });
	const chip = screen.getByTestId('price-discount-10');
	await act(async () => chip.focus());
	await act(async () => {
		fireEvent.keyDown(chip, { key: 'Escape' });
	});

	expect(onChangeText).not.toHaveBeenCalled();
	expect(atRest()).toBe(true);
	expect(document.activeElement).toBe(screen.getByTestId('price'));
});

it('an untouched field: the chip discounts the stored number', async () => {
	const onChangeText = setup([10]);
	await open();
	await act(async () => {
		fireEvent.click(screen.getByTestId('price-discount-10'));
	});

	expect(onChangeText).toHaveBeenCalledTimes(1);
	expect(onChangeText).toHaveBeenCalledWith(2.88);
});
