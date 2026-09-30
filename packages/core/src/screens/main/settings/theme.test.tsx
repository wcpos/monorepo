/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { SavedFieldProvider } from './components/saved-mark';
import { ThemeSettings } from './theme';

const mockLocalPatch = jest.fn().mockResolvedValue(undefined);
const store: { theme: string; scale?: string } = { theme: 'light' };

jest.mock('react-native', () => ({
	Pressable: ({
		children,
		onPress,
		testID,
		accessibilityState,
	}: React.PropsWithChildren<{
		onPress?: () => void;
		testID?: string;
		accessibilityState?: { selected?: boolean };
	}>) => (
		<button data-testid={testID} aria-selected={!!accessibilityState?.selected} onClick={onPress}>
			{children}
		</button>
	),
	View: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: ({ children }: React.PropsWithChildren) => <div>{children}</div> },
	FadeOut: { duration: () => 'fade-out' },
	useReducedMotion: () => false,
}));
jest.mock('@wcpos/components/lib/motion', () => ({ BEAT: 220 }));
jest.mock('uniwind', () => ({
	Uniwind: { setTheme: jest.fn() },
	useUniwind: () => ({ theme: 'light', hasAdaptiveThemes: false }),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <i data-icon={name} />,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => children,
}));
// The production prop contract: segments with their own testIDs, one value, and
// onValueChange only for a different segment (the control has no deselect).
jest.mock('@wcpos/components/segmented-control', () => ({
	SegmentedControl: ({
		segments,
		value,
		onValueChange,
	}: {
		segments: readonly { value: string; label: string; testID?: string }[];
		value: string;
		onValueChange: (value: string) => void;
	}) => (
		<div data-testid="settings-scale-group" data-value={value} role="radiogroup">
			{segments.map((segment) => (
				<button
					key={segment.value}
					role="radio"
					aria-checked={segment.value === value}
					data-testid={segment.testID}
					onClick={() => segment.value !== value && onValueChange(segment.value)}
				>
					{segment.label}
				</button>
			))}
		</div>
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
jest.mock('./components/settings-row', () => {
	const { SavedMark } = jest.requireActual('./components/saved-mark');
	return {
		SettingsRow: ({ children, name }: React.PropsWithChildren<{ name?: string }>) => (
			<div data-testid={`row-${name}`}>
				{name && <SavedMark name={name} />}
				{children}
			</div>
		),
	};
});

const renderTheme = () =>
	render(
		<SavedFieldProvider>
			<ThemeSettings />
		</SavedFieldProvider>
	);

beforeEach(() => {
	jest.clearAllMocks();
	store.scale = undefined;
});

describe('the theme tiles', () => {
	it('keeps the six themes and outlines only the selected one, with a check', () => {
		const { getByTestId } = renderTheme();
		const names = ['system', 'light', 'dark', 'ocean', 'sunset', 'monochrome'];

		names.forEach((name) => {
			const tile = getByTestId(`theme-option-${name}`);
			expect(tile.getAttribute('aria-selected')).toBe(String(name === 'light'));
			expect(!!tile.querySelector('[data-icon="check"]')).toBe(name === 'light');
		});
	});

	it('persists a chosen theme and marks the status line Saved', async () => {
		const { getByTestId } = renderTheme();

		await act(async () => {
			fireEvent.click(getByTestId('theme-option-ocean'));
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({ document: store, data: { theme: 'ocean' } });
		expect(getByTestId('settings-saved-theme').textContent).toBe('settings.saved');
	});
});

describe('the Scale row', () => {
	it('offers exactly the four steps on a segmented control, each with its own testID', () => {
		const { getByTestId, getAllByTestId } = renderTheme();

		['auto', 'compact', 'regular', 'spacious'].forEach((option) => {
			expect(getByTestId(`settings-scale-${option}`).textContent).toBe(`settings.scale.${option}`);
		});
		expect(getAllByTestId(/^settings-scale-(auto|compact|regular|spacious)$/)).toHaveLength(4);
		expect(getByTestId('settings-scale-group').getAttribute('role')).toBe('radiogroup');
	});

	// Absent means Auto: a store that has never had the field set still shows the
	// control on Auto rather than on nothing.
	it('shows Auto when the store has no stored step', () => {
		const { getByTestId } = renderTheme();

		expect(getByTestId('settings-scale-group').getAttribute('data-value')).toBe('auto');
	});

	it('shows the stored step', () => {
		store.scale = 'spacious';

		const { getByTestId } = renderTheme();

		expect(getByTestId('settings-scale-group').getAttribute('data-value')).toBe('spacious');
		expect(getByTestId('settings-scale-spacious').getAttribute('aria-checked')).toBe('true');
	});

	// Written through localPatch like the theme, so it lands in the same
	// device-local field and never reaches the server.
	it('persists the chosen step through localPatch and marks the row Saved', async () => {
		const { getByTestId, queryByTestId } = renderTheme();
		expect(queryByTestId('settings-saved-scale')).toBeNull();

		await act(async () => {
			fireEvent.click(getByTestId('settings-scale-compact'));
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: store,
			data: { scale: 'compact' },
		});
		expect(getByTestId('row-scale').contains(getByTestId('settings-saved-scale'))).toBe(true);
	});

	it('writes nothing when the current step is pressed again', () => {
		const { getByTestId } = renderTheme();

		fireEvent.click(getByTestId('settings-scale-auto'));

		expect(mockLocalPatch).not.toHaveBeenCalled();
	});
});
