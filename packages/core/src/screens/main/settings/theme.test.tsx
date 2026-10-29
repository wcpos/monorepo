/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';
import { Uniwind } from 'uniwind';

import { ThemeSettings } from './theme';

jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../jest/property-row.test-utils')
);
jest.mock('expo-haptics', () => ({}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
	FadeOut: { duration: jest.fn() },
	useReducedMotion: () => true,
}));
jest.mock('@wcpos/components/lib/motion', () => ({ BEAT: 220 }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/label', () => ({
	Label: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/form', () => ({
	...jest.requireActual('@wcpos/components/form/saved-mark'),
}));
jest.mock('@wcpos/components/radio-group', () => {
	const ReactMock = jest.requireActual('react') as typeof React;
	const Ctx = ReactMock.createContext<{ value: string; select: (v: string) => void }>({
		value: '',
		select: () => {},
	});
	return {
		RadioGroup: ({
			children,
			value,
			onValueChange,
			'aria-label': label,
		}: React.PropsWithChildren<{
			value: string;
			onValueChange: (v: string) => void;
			'aria-label': string;
		}>) => (
			<Ctx.Provider value={{ value, select: onValueChange }}>
				<div role="radiogroup" aria-label={label}>
					{children}
				</div>
			</Ctx.Provider>
		),
		RadioGroupOption: ({
			value,
			label,
			right,
			testID,
		}: {
			value: string;
			label: string;
			right?: React.ReactNode;
			testID?: string;
		}) => {
			const group = ReactMock.useContext(Ctx);
			return (
				<div>
					<button
						role="radio"
						aria-checked={group.value === value}
						data-testid={testID}
						onClick={() => group.select(value)}
					>
						{label}
					</button>
					{right}
				</div>
			);
		},
	};
});

const mockLocalPatch = jest.fn().mockResolvedValue({});
const store: { theme: string; scale?: string; icons?: string } = { theme: 'light' };
const mockIconSets = [
	'fontawesome',
	'tabler',
	'tabler-2',
	'hugeicons',
	'lucide',
	'phosphor',
	'iconoir',
	'solar',
];

let mockTheme = 'light';
let mockAdaptive = false;
jest.mock('uniwind', () => ({
	Uniwind: { setTheme: jest.fn() },
	useUniwind: () => ({ theme: mockTheme, hasAdaptiveThemes: mockAdaptive }),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
	IconSetProvider: ({ set, children }: React.PropsWithChildren<{ set: string }>) => (
		<span data-set={set}>{children}</span>
	),
	// A getter: the factory is hoisted above the list it hands out.
	get ICON_SET_IDS() {
		return mockIconSets;
	},
	DEFAULT_ICON_SET: 'tabler',
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(document: T, selector: (value: T) => unknown) => selector(document),
}));
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => ({ store }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	patchStoreSettings: (document: unknown, data: unknown) => mockLocalPatch({ document, data }),
}));
jest.mock('./components/settings-section', () => ({
	SettingsSection: ({ title, children }: React.PropsWithChildren<{ title?: string }>) => (
		<section aria-label={title}>{children}</section>
	),
}));

beforeEach(() => {
	jest.clearAllMocks();
	store.scale = undefined;
	store.icons = undefined;
	mockTheme = 'light';
	mockAdaptive = false;
});

describe('the Scale section', () => {
	// Theme, Scale, Icons: three titled sections, never a lone key row between two of them.
	it('is a titled section whose description is the row that keys the steps', () => {
		const { getByRole } = render(<ThemeSettings />);
		const section = getByRole('region', { name: 'settings.scale' });
		expect(section.textContent).toContain('settings.scale.description');
		expect(section.querySelector('[data-testid="settings-scale-auto"]')).not.toBeNull();
	});

	it('offers four scale steps with Auto selected by default', () => {
		const { getByTestId, getAllByTestId, getAllByRole } = render(<ThemeSettings />);

		['auto', 'compact', 'regular', 'spacious'].forEach((option) => {
			expect(getByTestId(`settings-scale-${option}`).textContent).toBe(`settings.scale.${option}`);
		});
		expect(getAllByTestId(/^settings-scale-(auto|compact|regular|spacious)$/)).toHaveLength(4);
		// Scale is the first radio group on the screen; Icons (named) is the second.
		expect(getAllByRole('radiogroup')[0].querySelectorAll('[role="radio"]')).toHaveLength(4);
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

describe('the Icons section', () => {
	it('offers the eight sets in order, Tabler 1.5 selected by default', () => {
		const { getByTestId, getAllByTestId, getByRole } = render(<ThemeSettings />);

		expect(
			getAllByTestId(/^settings-icons-(?!.*-samples$)/).map((row) =>
				row.getAttribute('data-testid')
			)
		).toEqual(mockIconSets.map((id) => `settings-icons-${id}`));
		expect(
			getByRole('radiogroup', { name: 'settings.icons' }).querySelectorAll('[role="radio"]')
		).toHaveLength(mockIconSets.length);
		mockIconSets.forEach((id) => {
			const row = getByTestId(`settings-icons-${id}`);
			expect(row.getAttribute('role')).toBe('radio');
			expect(row.getAttribute('aria-checked')).toBe(String(id === 'tabler'));
			expect(row.textContent).toBe(`settings.icons.${id}`);
		});
	});

	// Each row draws its strip in its own family, whatever the app draws.
	it("draws six sample glyphs inside each row in that row's set", () => {
		const { getByTestId } = render(<ThemeSettings />);

		mockIconSets.forEach((id) => {
			const strip = getByTestId(`settings-icons-${id}-samples`).closest('[data-set]')!;
			expect(strip.getAttribute('data-set')).toBe(id);
			expect(
				Array.from(strip.querySelectorAll('[data-icon]')).map((icon) =>
					icon.getAttribute('data-icon')
				)
			).toEqual(['cart', 'search', 'viewGrid', 'viewList', 'settings', 'confirmed']);
		});
	});

	it('shows the stored set', () => {
		store.icons = 'phosphor';

		const { getByTestId } = render(<ThemeSettings />);

		expect(getByTestId('settings-icons-phosphor').getAttribute('aria-checked')).toBe('true');
		expect(getByTestId('settings-icons-tabler').getAttribute('aria-checked')).toBe('false');
	});

	it('persists the pressed set through localPatch and marks it saved', async () => {
		const { getByTestId } = render(<ThemeSettings />);

		await act(async () => fireEvent.click(getByTestId('settings-icons-lucide')));

		expect(mockLocalPatch).toHaveBeenCalledWith({ document: store, data: { icons: 'lucide' } });
		expect(getByTestId('saved-icons').textContent).toBe('settings.saved');
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
		expect(getByTestId('saved-theme').textContent).toBe('settings.saved');
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			jest.mocked(Uniwind.setTheme).mock.invocationCallOrder[0]
		);
	});
});

it('marks Scale only after its patch resolves', async () => {
	let resolve!: (result: object) => void;
	mockLocalPatch.mockReturnValueOnce(
		new Promise<object>((done) => {
			resolve = done;
		})
	);
	const { getByTestId, queryByTestId } = render(<ThemeSettings />);
	fireEvent.click(getByTestId('settings-scale-compact'));
	expect(queryByTestId('saved-scale')).toBeNull();
	await act(async () => resolve({}));
	expect(getByTestId('saved-scale').textContent).toBe('settings.saved');
});

it('stays silent when the patch did not apply — localPatch logs a failed write and resolves undefined', async () => {
	mockLocalPatch.mockResolvedValueOnce(undefined);
	const { getByTestId, queryByTestId } = render(<ThemeSettings />);
	await act(async () => fireEvent.click(getByTestId('settings-scale-compact')));
	expect(mockLocalPatch).toHaveBeenCalled();
	expect(queryByTestId('saved-scale')).toBeNull();
});
