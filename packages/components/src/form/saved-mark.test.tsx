/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import {
	SavedFieldProvider,
	savedKeys,
	SavedMark,
	useMarkFailed,
	useMarkSaved,
	useSavedName,
} from './saved-mark';
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
const mockIcon = jest.fn((_props: { name: string; className?: string }) => null);
jest.mock('@wcpos/components/icon', () => ({ Icon: (props: { name: string }) => mockIcon(props) }));
// The ink is a class on the Text; the web Text drops className in jest, so a span carries it here.
jest.mock('@wcpos/components/text', () => ({
	Text: (props: { className?: string; children?: React.ReactNode }) => (
		<span data-classes={props.className}>{props.children}</span>
	),
}));
function Marks() {
	const markSaved = useMarkSaved();
	const markFailed = useMarkFailed();
	return (
		<>
			<button onClick={() => markSaved(['name'])}>Save name</button>
			<button onClick={() => markFailed(['name'])}>Fail name</button>
			<button onClick={() => markSaved(['restore'])}>Restore</button>
			<SavedMark name="name" label="Saved" failedLabel="Not saved" />
			<SavedMark name="restore" label="Restored" />
		</>
	);
}
beforeEach(() => {
	jest.useFakeTimers();
	mockReduced = false;
	mockDuration.mockClear();
	mockIcon.mockClear();
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
	expect(queryByTestId('saved-name')).toBeNull();
	fireEvent.click(getByText('Save name'));
	expect(getByTestId('saved-name').textContent).toBe('Saved');
	expect(queryByTestId('saved-restore')).toBeNull();
	act(() => jest.advanceTimersByTime(1199));
	expect(getByTestId('saved-name')).toBeTruthy();
	act(() => jest.advanceTimersByTime(1));
	expect(queryByTestId('saved-name')).toBeNull();
	expect(mockDuration).toHaveBeenCalledWith(220);
});
it('a saved mark is a check in the success colour', () => {
	const { getByText, getByTestId } = render(
		<SavedFieldProvider>
			<Marks />
		</SavedFieldProvider>
	);
	fireEvent.click(getByText('Save name'));
	expect(mockIcon).toHaveBeenLastCalledWith(
		expect.objectContaining({ name: 'check', className: 'text-success' })
	);
	expect(getByTestId('saved-name').querySelector('[data-classes*="text-success"]')).toBeTruthy();
	expect(getByTestId('saved-name').querySelector('[data-classes*="text-bad"]')).toBeNull();
});
it('a failed write is an alert in the error colour with its own words, and holds until the next write', () => {
	const { getByText, getByTestId, queryByTestId } = render(
		<SavedFieldProvider>
			<Marks />
		</SavedFieldProvider>
	);
	fireEvent.click(getByText('Fail name'));
	expect(queryByTestId('saved-name')).toBeNull();
	expect(getByTestId('failed-name').textContent).toBe('Not saved');
	expect(mockIcon).toHaveBeenLastCalledWith(
		expect.objectContaining({ name: 'alert', className: 'text-bad' })
	);
	expect(getByTestId('failed-name').querySelector('[data-classes*="text-bad"]')).toBeTruthy();
	// No timer: the record does not hold the edit until a later write lands.
	act(() => jest.advanceTimersByTime(60_000));
	expect(getByTestId('failed-name')).toBeTruthy();
	fireEvent.click(getByText('Save name'));
	expect(queryByTestId('failed-name')).toBeNull();
	expect(getByTestId('saved-name').textContent).toBe('Saved');
});
it('useSavedName reads the name whose mark shows, and clears with it', () => {
	function Name() {
		return <span data-testid="saved-name-value">{useSavedName()}</span>;
	}
	const { getByText, getByTestId } = render(
		<SavedFieldProvider>
			<Marks />
			<Name />
		</SavedFieldProvider>
	);
	expect(getByTestId('saved-name-value').textContent).toBe('');
	fireEvent.click(getByText('Save name'));
	expect(getByTestId('saved-name-value').textContent).toBe('name');
	act(() => jest.advanceTimersByTime(1200));
	expect(getByTestId('saved-name-value').textContent).toBe('');
});
it('supports a result label and switches to the latest saved field', () => {
	const { getByText, getByTestId, queryByTestId } = render(
		<SavedFieldProvider>
			<Marks />
		</SavedFieldProvider>
	);
	fireEvent.click(getByText('Save name'));
	fireEvent.click(getByText('Restore'));
	expect(getByTestId('saved-restore').textContent).toBe('Restored');
	expect(queryByTestId('saved-name')).toBeNull();
});
it('renders no mark and ignores writes on a page without a provider', () => {
	const { getByText, queryByTestId } = render(<Marks />);
	fireEvent.click(getByText('Save name'));
	fireEvent.click(getByText('Restore'));
	expect(queryByTestId('saved-name')).toBeNull();
	expect(queryByTestId('saved-restore')).toBeNull();
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
	expect(queryByTestId('saved-name')).toBeNull();
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
