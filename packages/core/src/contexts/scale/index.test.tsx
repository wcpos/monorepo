/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

const platform = { OS: 'web' };
const dimensions = { width: 1024, height: 768 };
const store: { scale?: string; $?: BehaviorSubject<{ scale: string }> } = { scale: undefined };
const appState: { store: { scale?: string } | null } = { store };
let pointer: 'coarse' | 'fine' = 'fine';

jest.mock('react-native', () => ({
	Platform: platform,
	useWindowDimensions: () => dimensions,
}));
jest.mock('uniwind', () => ({
	// The real web component renders a `display: contents` div; only the scoped
	// values matter here, and the root mirror is what covers what escapes it.
	ScopedVariables: ({
		variables,
		children,
	}: React.PropsWithChildren<{ variables: Record<string, number> }>) => (
		<div data-testid="scope" data-variables={JSON.stringify(variables)}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => pointer }));
jest.mock('../app-state', () => ({ useAppState: () => appState }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

// eslint-disable-next-line import/first
import { ScaleProvider } from './index';

const SEVEN = [
	'--spacing',
	'--text-base',
	'--spacing-ctl',
	'--spacing-row',
	'--spacing-tile',
	'--radius',
	'--text-amt',
];

function scopedVariables(container: HTMLElement) {
	return JSON.parse(
		container.querySelector('[data-testid="scope"]')!.getAttribute('data-variables')!
	);
}

function rootValues() {
	const root = document.documentElement.style;
	return SEVEN.map((name) => root.getPropertyValue(name));
}

beforeEach(() => {
	platform.OS = 'web';
	dimensions.width = 1024;
	dimensions.height = 768;
	store.scale = undefined;
	delete store.$;
	appState.store = store;
	pointer = 'fine';
	SEVEN.forEach((name) => document.documentElement.style.removeProperty(name));
});

describe('ScaleProvider', () => {
	it('updates scoped variables when the same store emits a new scale snapshot', () => {
		store.scale = 'regular';
		store.$ = new BehaviorSubject({ scale: 'regular' });
		const { container } = render(<ScaleProvider>child</ScaleProvider>);
		expect(scopedVariables(container)['--text-base']).toBe(14);

		act(() => store.$!.next({ scale: 'compact' }));

		expect(scopedVariables(container)).toEqual({
			'--spacing': 3.5,
			'--text-base': 13,
			'--spacing-ctl': 40,
			'--spacing-row': 36,
			'--spacing-tile': 56,
			'--radius': 6,
			'--text-amt': 34,
		});
	});

	it('scopes the seven variables for a spacious store on a 390-wide window', () => {
		store.scale = 'spacious';
		dimensions.width = 390;
		dimensions.height = 844;

		const { container } = render(<ScaleProvider>child</ScaleProvider>);

		expect(scopedVariables(container)).toEqual({
			'--spacing': 5,
			'--text-base': 16,
			'--spacing-ctl': 52,
			'--spacing-row': 52,
			'--spacing-tile': 80,
			'--radius': 10,
			'--text-amt': 48,
		});
	});

	it('falls back to Auto with no store, so the auth screens scale', () => {
		appState.store = null;
		dimensions.width = 390;

		const { container } = render(<ScaleProvider>child</ScaleProvider>);

		expect(scopedVariables(container)['--text-base']).toBe(13);
	});

	// Auto reads the shortest side on native so rotation does not reflow, and the
	// width on web where the merchant resized the window.
	it('reads the width on web and the shortest side on native', () => {
		dimensions.width = 1700;
		dimensions.height = 500;

		const web = render(<ScaleProvider>child</ScaleProvider>);
		expect(scopedVariables(web.container)['--text-base']).toBe(16);
		web.unmount();

		platform.OS = 'ios';
		const native = render(<ScaleProvider>child</ScaleProvider>);
		expect(scopedVariables(native.container)['--text-base']).toBe(13);
	});

	it('writes the step onto the document root so DOM portals inherit it', () => {
		store.scale = 'compact';
		pointer = 'coarse';

		render(<ScaleProvider>child</ScaleProvider>);

		expect(rootValues()).toEqual(['3.5px', '13px', '44px', '44px', '56px', '6px', '34px']);
	});

	it('updates the root mirror when the step changes', () => {
		const { rerender } = render(<ScaleProvider>child</ScaleProvider>);
		expect(document.documentElement.style.getPropertyValue('--text-base')).toBe('14px');

		store.scale = 'spacious';
		act(() => {
			rerender(<ScaleProvider>changed</ScaleProvider>);
		});

		expect(document.documentElement.style.getPropertyValue('--text-base')).toBe('16px');
	});

	it('removes only its own names on unmount', () => {
		document.documentElement.style.setProperty('--color-primary', 'rebeccapurple');

		const { unmount } = render(<ScaleProvider>child</ScaleProvider>);
		unmount();

		expect(rootValues()).toEqual(['', '', '', '', '', '', '']);
		expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(
			'rebeccapurple'
		);
	});

	it('writes nothing to the document on native', () => {
		platform.OS = 'ios';

		render(<ScaleProvider>child</ScaleProvider>);

		expect(rootValues()).toEqual(['', '', '', '', '', '', '']);
	});
});
