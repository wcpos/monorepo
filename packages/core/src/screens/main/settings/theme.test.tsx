/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render } from '@testing-library/react';

import { ThemeSettings } from './theme';

const mockLocalPatch = jest.fn().mockResolvedValue(undefined);
const store: { theme: string; scale?: string } = { theme: 'light' };

jest.mock('react-native', () => ({
	Pressable: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
		<button onClick={onPress}>{children}</button>
	),
	View: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('uniwind', () => ({
	Uniwind: { setTheme: jest.fn() },
	useUniwind: () => ({ theme: 'light', hasAdaptiveThemes: false }),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => children,
}));
// The production prop contract: a single-value group reporting through
// onValueChange, with each option carrying its own testID.
jest.mock('@wcpos/components/toggle-group', () => ({
	ToggleGroup: ({
		children,
		value,
		onValueChange,
	}: React.PropsWithChildren<{ value?: string; onValueChange?: (value?: string) => void }>) => (
		<div data-testid="settings-scale-group" data-value={value}>
			{React.Children.map(children, (child) =>
				React.isValidElement<{ onValueChange?: (value?: string) => void }>(child)
					? React.cloneElement(child, { onValueChange })
					: child
			)}
			{/* The real group reports undefined when the active option is pressed
			    again; nothing else can reach that branch. */}
			<button data-testid="scale-deselect" onClick={() => onValueChange?.(undefined)} />
		</div>
	),
	ToggleGroupItem: ({
		children,
		value,
		testID,
		onValueChange,
	}: React.PropsWithChildren<{
		value: string;
		testID?: string;
		onValueChange?: (value?: string) => void;
	}>) => (
		<button data-testid={testID} onClick={() => onValueChange?.(value)}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(document: T, selector: (value: T) => unknown) => selector(document),
}));
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => ({ store }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('./components/settings-section', () => ({
	SettingsSection: ({ children }: React.PropsWithChildren) => children,
}));

beforeEach(() => {
	jest.clearAllMocks();
	store.scale = undefined;
});

describe('the Scale row', () => {
	it('offers exactly the four steps, each with its own testID', () => {
		const { getByTestId, getAllByTestId } = render(<ThemeSettings />);

		['auto', 'compact', 'regular', 'spacious'].forEach((option) => {
			expect(getByTestId(`settings-scale-${option}`).textContent).toBe(`settings.scale.${option}`);
		});
		expect(getAllByTestId(/^settings-scale-(auto|compact|regular|spacious)$/)).toHaveLength(4);
	});

	// Absent means Auto: a store that has never had the field set still shows the
	// group on Auto rather than on nothing.
	it('shows Auto when the store has no stored step', () => {
		const { getByTestId } = render(<ThemeSettings />);

		expect(getByTestId('settings-scale-group').getAttribute('data-value')).toBe('auto');
	});

	it('shows the stored step', () => {
		store.scale = 'spacious';

		const { getByTestId } = render(<ThemeSettings />);

		expect(getByTestId('settings-scale-group').getAttribute('data-value')).toBe('spacious');
	});

	// Written through localPatch like the theme, so it lands in the same
	// device-local field and never reaches the server.
	it('persists the chosen step through localPatch', () => {
		const { getByTestId } = render(<ThemeSettings />);

		fireEvent.click(getByTestId('settings-scale-compact'));

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: store,
			data: { scale: 'compact' },
		});
	});

	// The toggle group reports `undefined` when the active option is pressed
	// again. Writing that would store a step outside the four.
	it('ignores a deselect instead of storing an empty step', () => {
		const { getByTestId } = render(<ThemeSettings />);

		fireEvent.click(getByTestId('scale-deselect'));

		expect(mockLocalPatch).not.toHaveBeenCalled();
	});
});
