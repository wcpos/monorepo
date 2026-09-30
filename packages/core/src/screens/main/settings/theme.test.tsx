/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';
import { Uniwind } from 'uniwind';

import { ThemeSettings } from './theme';

jest.mock('expo-haptics', () => ({}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/form', () => ({ FormItem: () => null, FormLabel: () => null }));

const mockLocalPatch = jest.fn().mockResolvedValue(undefined);
const store: { theme: string; scale?: string } = { theme: 'light' };

let mockTheme = 'light';
let mockAdaptive = false;
jest.mock('uniwind', () => ({
	Uniwind: { setTheme: jest.fn() },
	useUniwind: () => ({ theme: mockTheme, hasAdaptiveThemes: mockAdaptive }),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
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
	mockTheme = 'light';
	mockAdaptive = false;
});

describe('the Scale row', () => {
	it('offers exactly the four steps, each with its own testID', () => {
		const { getByTestId, getAllByTestId, getByRole } = render(<ThemeSettings />);

		['auto', 'compact', 'regular', 'spacious'].forEach((option) => {
			expect(getByTestId(`settings-scale-${option}`).textContent).toBe(`settings.scale.${option}`);
		});
		expect(getAllByTestId(/^settings-scale-(auto|compact|regular|spacious)$/)).toHaveLength(4);
		expect(getByRole('radiogroup').querySelectorAll('[role="radio"]')).toHaveLength(4);
	});

	// Absent means Auto: a store that has never had the field set still shows the
	// group on Auto rather than on nothing.
	it('shows Auto when the store has no stored step', () => {
		const { getByTestId } = render(<ThemeSettings />);

		expect(getByTestId('settings-scale-auto').getAttribute('aria-checked')).toBe('true');
	});

	it('shows the stored step', () => {
		store.scale = 'spacious';

		const { getByTestId } = render(<ThemeSettings />);

		expect(getByTestId('settings-scale-spacious').getAttribute('aria-checked')).toBe('true');
	});

	// Written through localPatch like the theme, so it lands in the same
	// device-local field and never reaches the server.
	it.each(['auto', 'compact', 'regular', 'spacious'])(
		'persists %s through localPatch',
		async (value) => {
			store.scale = value === 'auto' ? 'regular' : 'auto';
			const { getByTestId } = render(<ThemeSettings />);

			await act(async () => fireEvent.click(getByTestId(`settings-scale-${value}`)));

			expect(mockLocalPatch).toHaveBeenCalledWith({
				document: store,
				data: { scale: value },
			});
		}
	);

	// Segments cannot deselect: pressing the current step must not write an empty value.
	it('keeps the current step selected when it is pressed again', () => {
		const { getByTestId } = render(<ThemeSettings />);
		fireEvent.click(getByTestId('settings-scale-auto'));
		expect(getByTestId('settings-scale-auto').getAttribute('aria-checked')).toBe('true');
		expect(mockLocalPatch).not.toHaveBeenCalled();
	});
});

describe('theme tiles', () => {
	it('marks only the selected tile with a check and preserves the six options', () => {
		const { getByTestId, getAllByTestId, rerender } = render(<ThemeSettings />);
		const options = ['system', 'light', 'dark', 'ocean', 'sunset', 'monochrome'];
		expect(getAllByTestId(/^theme-option-/)).toHaveLength(6);
		for (const name of options) {
			mockTheme = name;
			mockAdaptive = name === 'system';
			rerender(<ThemeSettings />);
			for (const option of options) {
				const tile = getByTestId(`theme-option-${option}`);
				expect(tile.getAttribute('aria-selected')).toBe(String(option === name));
				expect(!!tile.querySelector('[data-icon="check"]')).toBe(option === name);
			}
		}
	});

	it('persists the theme before applying it', async () => {
		const { getByTestId } = render(<ThemeSettings />);
		await act(async () => fireEvent.click(getByTestId('theme-option-ocean')));
		expect(mockLocalPatch).toHaveBeenCalledWith({ document: store, data: { theme: 'ocean' } });
		expect(Uniwind.setTheme).toHaveBeenCalledWith('ocean');
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			jest.mocked(Uniwind.setTheme).mock.invocationCallOrder[0]
		);
	});
});
