/**
 * @jest-environment jsdom
 *
 * The header centers its title by measuring the left/right sections and the
 * title's intrinsic width. Inactive drawer screens are display:none on web, so
 * every element reports a zero-width layout while another screen is active —
 * these tests pin that zero reports never wipe the measurements (the cause of
 * the title jumping left for a frame on every navigation) and that the title
 * stays invisible until the first real measurements land.
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

type LayoutHandler = (event: { nativeEvent: { layout: { width: number } } }) => void;
const mockLayoutHandlers: Record<string, LayoutHandler> = {};
let mockScreenSize = 'lg';

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('react-native', () => {
	const R = require('react');
	return {
		View: ({ children, testID, onLayout, style, id }: Record<string, unknown>) => {
			if (typeof onLayout === 'function' && typeof testID === 'string') {
				mockLayoutHandlers[testID] = onLayout as LayoutHandler;
			}
			return R.createElement('div', { 'data-testid': testID, style, id }, children as never);
		},
	};
});
jest.mock('@wcpos/components/text', () => {
	const R = require('react');
	return {
		Text: ({ children, testID, className, style }: Record<string, unknown>) =>
			R.createElement('div', { 'data-testid': testID, className, style }, children as never),
	};
});
jest.mock('@wcpos/components/lib/utils', () => ({
	cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));
jest.mock('@wcpos/components/hstack', () => {
	const R = require('react');
	return {
		HStack: ({ children }: Record<string, unknown>) =>
			R.createElement('div', null, children as never),
	};
});
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('observable-hooks', () => ({
	useObservableState: (_observable: unknown, initial: unknown) => initial,
}));
jest.mock('react-native-edge-to-edge', () => ({ SystemBars: () => null }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0 }),
}));
jest.mock('./left', () => ({ HeaderLeft: () => null }));
jest.mock('./right', () => ({ HeaderRight: () => null }));
jest.mock('./upgrade-notice', () => ({ UpgradeNotice: () => null }));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { name: 'Dev Store', name$: null } }),
}));
jest.mock('../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
}));

// eslint-disable-next-line import/first -- jest.mock() must be registered before this import
import { Header } from './index';

function renderHeader() {
	return render(
		<Header options={{ title: 'POS' } as never} showUpgrade={false} setShowUpgrade={jest.fn()} />
	);
}

function fireLayout(testID: string, width: number) {
	act(() => {
		mockLayoutHandlers[testID]({ nativeEvent: { layout: { width } } });
	});
}

/** Report real measurements: no left button (lg), 212px of right buttons. */
function measureAll({ container = 1003, intrinsic = 208 } = {}) {
	fireLayout('header-right-section', 212);
	fireLayout('header-title-container', container);
	fireLayout('header-title-measure', intrinsic);
}

const titleText = () => screen.getByTestId('header-title-text');
const titleContainer = () => screen.getByTestId('header-title-container');

beforeEach(() => {
	mockScreenSize = 'lg';
	for (const key of Object.keys(mockLayoutHandlers)) delete mockLayoutHandlers[key];
});

describe('header title centering', () => {
	it('keeps the title invisible until measurements land, then shows it centered', () => {
		renderHeader();

		expect(titleText().style.opacity).toBe('0');
		expect(titleContainer().style.paddingLeft).toBe('0px');

		measureAll();

		expect(titleText().style.opacity).not.toBe('0');
		expect(titleText().className).toContain('text-center');
		// right (212) minus left (0) pushes the title right to true viewport center
		expect(titleContainer().style.paddingLeft).toBe('212px');
	});

	it('ignores the zero-width layouts reported while the screen is hidden', () => {
		renderHeader();
		measureAll();
		expect(titleContainer().style.paddingLeft).toBe('212px');

		// display:none makes every element report zero width
		fireLayout('header-right-section', 0);
		fireLayout('header-title-container', 0);
		fireLayout('header-title-measure', 0);
		fireLayout('header-left-section', 0);

		// measurements survive, so the re-shown title paints centered immediately
		expect(titleContainer().style.paddingLeft).toBe('212px');
		expect(titleText().style.opacity).not.toBe('0');
		expect(titleText().className).toContain('text-center');
	});

	it('gives a too-long title the full width, but still shows it once measured', () => {
		renderHeader();
		measureAll({ container: 400, intrinsic: 500 });

		expect(titleContainer().style.paddingLeft).toBe('0px');
		expect(titleText().className).not.toContain('text-center');
		expect(titleText().style.opacity).not.toBe('0');
	});

	it('shows the title immediately on small screens, which never center', () => {
		mockScreenSize = 'sm';
		renderHeader();

		expect(titleText().style.opacity).not.toBe('0');
		expect(titleText().className).not.toContain('text-center');
	});

	it('waits for the left section on medium screens before showing the title', () => {
		mockScreenSize = 'md';
		renderHeader();

		// right/container/intrinsic can report before the left button (CodeRabbit /
		// Codex review finding on #1389): the title must stay hidden until the left
		// width is in, or it would paint over-shifted and slide once left lands
		measureAll({ container: 900 });
		expect(titleText().style.opacity).toBe('0');

		fireLayout('header-left-section', 80);
		expect(titleText().style.opacity).not.toBe('0');
		// right (212) minus left (80)
		expect(titleContainer().style.paddingLeft).toBe('132px');
	});

	it('waits for a current left measurement when entering medium', () => {
		mockScreenSize = 'sm';
		const { rerender } = renderHeader();
		fireLayout('header-left-section', 80);
		measureAll({ container: 900 });

		mockScreenSize = 'md';
		rerender(
			<Header options={{ title: 'POS' } as never} showUpgrade={false} setShowUpgrade={jest.fn()} />
		);
		expect(titleText().style.opacity).toBe('0');

		fireLayout('header-left-section', 96);
		expect(titleText().style.opacity).not.toBe('0');
		expect(titleContainer().style.paddingLeft).toBe('116px');
	});

	it('drops the stale left measurement when resizing into the large layout', () => {
		mockScreenSize = 'md';
		const { rerender } = renderHeader();
		fireLayout('header-left-section', 80);
		measureAll({ container: 900 });
		// right (212) minus left (80)
		expect(titleContainer().style.paddingLeft).toBe('132px');

		// large screens render no left button; its zero report is filtered, so the
		// true zero must be derived from the screen size
		mockScreenSize = 'lg';
		rerender(
			<Header options={{ title: 'POS' } as never} showUpgrade={false} setShowUpgrade={jest.fn()} />
		);
		fireLayout('header-left-section', 0);

		expect(titleContainer().style.paddingLeft).toBe('212px');
	});
});
