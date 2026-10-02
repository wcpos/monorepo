/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { SavedFieldProvider, savedKeys, SavedMark, useMarkSaved } from './saved-mark';
const mockDuration = jest.fn((_duration: number) => 'fade');
let mockReduced = false;
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
	FadeOut: { duration: (duration: number) => mockDuration(duration) },
	ZoomIn: { duration: () => ({ easing: () => undefined }) },
	useReducedMotion: () => mockReduced,
}));
jest.mock('@wcpos/components/lib/motion', () => ({ BEAT: 220 }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
function Marks() {
	const markSaved = useMarkSaved();
	return (
		<>
			<button onClick={() => markSaved(['name'])}>Save name</button>
			<button onClick={() => markSaved(['restore'])}>Restore</button>
			<SavedMark name="name" />
			<SavedMark name="restore" label="Restored" />
		</>
	);
}
beforeEach(() => {
	jest.useFakeTimers();
	mockReduced = false;
	mockDuration.mockClear();
});
afterEach(() => {
	jest.useRealTimers();
});
it('shows only the last saved field, holds for 1200ms and uses the short opacity exit', () => {
	const { getByText, getByTestId, queryByTestId } = render(
		<SavedFieldProvider>
			<Marks />
		</SavedFieldProvider>
	);
	expect(queryByTestId('settings-saved-name')).toBeNull();
	fireEvent.click(getByText('Save name'));
	expect(getByTestId('settings-saved-name').textContent).toBe('settings.saved');
	expect(queryByTestId('settings-saved-restore')).toBeNull();
	act(() => jest.advanceTimersByTime(1199));
	expect(getByTestId('settings-saved-name')).toBeTruthy();
	act(() => jest.advanceTimersByTime(1));
	expect(queryByTestId('settings-saved-name')).toBeNull();
	expect(mockDuration).toHaveBeenCalledWith(220);
});
it('supports a result label and switches to the latest saved field', () => {
	const { getByText, getByTestId, queryByTestId } = render(
		<SavedFieldProvider>
			<Marks />
		</SavedFieldProvider>
	);
	fireEvent.click(getByText('Save name'));
	fireEvent.click(getByText('Restore'));
	expect(getByTestId('settings-saved-restore').textContent).toBe('Restored');
	expect(queryByTestId('settings-saved-name')).toBeNull();
});
it('renders no mark and ignores writes on a page without a provider', () => {
	const { getByText, queryByTestId } = render(<Marks />);
	fireEvent.click(getByText('Save name'));
	fireEvent.click(getByText('Restore'));
	expect(queryByTestId('settings-saved-name')).toBeNull();
	expect(queryByTestId('settings-saved-restore')).toBeNull();
});
it('disappears without a fade under reduced motion', () => {
	mockReduced = true;
	const { getByText, queryByTestId } = render(
		<SavedFieldProvider>
			<Marks />
		</SavedFieldProvider>
	);
	fireEvent.click(getByText('Save name'));
	act(() => jest.advanceTimersByTime(1200));
	expect(queryByTestId('settings-saved-name')).toBeNull();
	expect(mockDuration).not.toHaveBeenCalled();
});

describe('savedKeys', () => {
	it('keeps only the keys whose value differs from the record, comparing as strings', () => {
		const before = { name: 'Shop', price_num_decimals: 2, locale: 'es_ES', empty: undefined };
		expect(savedKeys(before, { name: 'Shop two' })).toEqual(['name']);
		// The form's reactive re-bind echoes a numeric input's number and a select's key unchanged.
		expect(savedKeys(before, { price_num_decimals: '2' })).toEqual([]);
		expect(savedKeys(before, { locale: 'es_ES' })).toEqual([]);
		expect(savedKeys(before, { empty: '' })).toEqual([]);
		expect(savedKeys(before, { name: 'Shop two', locale: 'es_ES' })).toEqual(['name']);
	});
	it('marks every key when there is no record to compare against', () => {
		expect(savedKeys(undefined, { a: 1, b: 2 })).toEqual(['a', 'b']);
	});
});
