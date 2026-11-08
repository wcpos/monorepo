import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { TONE } from '../lib/tone';
import { Icon, type IconName, IconSetProvider } from './index';
import { ICON_NAMES } from './names';
import { ICON_SET_IDS, ICON_SETS } from './sets';

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: false, isElectron: false } }));
const { Platform: mockPlatform } = jest.requireMock('@wcpos/utils/platform');
const mockUseCSSVariable = jest.fn((_name: string) => '#123456');
jest.mock('uniwind', () => ({ useCSSVariable: (name: string) => mockUseCSSVariable(name) }));
jest.mock('../text', () => ({
	TextClassContext: React.createContext(''),
	Text: ({ children }: React.PropsWithChildren) =>
		React.createElement('span', { 'data-testid': 'badge-text' }, children),
}));
// Jest does not compile Uniwind: expose the classes and pointer events the count box carries.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: ({
			className,
			pointerEvents,
			children,
		}: React.PropsWithChildren<{ className?: string; pointerEvents?: string }>) =>
			React.createElement(
				'div',
				{ 'data-class': className, 'data-pointer-events': pointerEvents },
				children
			),
	};
});
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		View: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
	},
	ReduceMotion: { System: 'system' },
	Easing: { bezier: () => 'ease', linear: 'linear' },
	Extrapolation: { CLAMP: 'clamp' },
	interpolate: (value: number) => value,
	useAnimatedStyle: () => ({}),
	useSharedValue: (value: number) => jest.requireActual('react').useRef({ value }).current,
	withSequence: (...steps: number[]) => steps.at(-1),
	withSpring: (value: number) => value,
	withTiming: (value: number) => value,
}));
jest.mock('../loader', () => ({
	Loader: () => null,
	Spin: ({ active, children }: React.PropsWithChildren<{ active: boolean }>) =>
		React.createElement('div', { 'data-testid': 'spin', 'data-active': String(active) }, children),
}));
jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});

it('resolves the same name through the provider-selected filled set', () => {
	const { container, rerender } = render(<Icon name="check" fill="#abcdef" />);
	const defaultPath = container.querySelector('path')?.getAttribute('d');
	rerender(
		<IconSetProvider set="phosphor">
			<Icon name="check" fill="#abcdef" />
		</IconSetProvider>
	);
	expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor');
	expect(container.querySelector('svg')).toHaveAttribute('color', '#abcdef');
	expect(container.querySelector('path')?.getAttribute('d')).not.toBe(defaultPath);
});

it('colours Tabler strokes without filling their outlines', () => {
	const { container } = render(<Icon name="check" variant="primary" fill="#abcdef" />);
	const svg = container.querySelector('svg');
	expect(container.querySelector('[stroke]')).toHaveAttribute('stroke', 'currentColor');
	expect(svg).toHaveAttribute('color', '#abcdef');
	expect(container.querySelector('path')).toHaveAttribute('fill', 'none');
	expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
	expect(svg).toHaveAttribute('width', '100%');
	expect(svg).toHaveAttribute('height', '100%');
	expect(container.querySelector('[stroke-width]')).toHaveAttribute('stroke-width', '1.5');
});

it('passes the resolved native theme colour to the stroke currentColor', () => {
	const { container } = render(<Icon name="check" variant="primary" />);
	expect(container.querySelector('svg')).toHaveAttribute('color', '#123456');
	expect(container.querySelector('[stroke]')).toHaveAttribute('stroke', 'currentColor');
});

it.each(ICON_SET_IDS)('%s provides every vocabulary glyph', (set) => {
	expect(Object.keys(ICON_SETS[set]).sort()).toEqual([...ICON_NAMES].sort());
	for (const name of ICON_NAMES) {
		expect(typeof ICON_SETS[set][name]).toBe('function');
	}
});

it.each(ICON_SET_IDS)('falls back to the active %s alert for an unknown dynamic name', (set) => {
	const { container, rerender } = render(
		<IconSetProvider set={set}>
			<Icon name={'unknown-dynamic-icon' as IconName} />
		</IconSetProvider>
	);
	const fallback = container.querySelector('svg')?.innerHTML;
	expect(container.querySelector('path')).not.toBeNull();
	rerender(
		<IconSetProvider set={set}>
			<Icon name="alert" />
		</IconSetProvider>
	);
	expect(container.querySelector('svg')?.innerHTML).toBe(fallback);
});

it('keeps CSS currentColor inheritance on web', () => {
	mockPlatform.isWeb = true;
	try {
		const { container } = render(<Icon name="check" />);
		expect(container.querySelector('svg')).toHaveAttribute('color', 'currentColor');
		expect(container.querySelector('[stroke]')).toHaveAttribute('stroke', 'currentColor');
	} finally {
		mockPlatform.isWeb = false;
	}
});

// A glyph that reads as motion turns in place rather than being swapped for the Loader (icon
// LEDGER line 6): the svg stays mounted, inside `Spin`, while it turns and after it stops; an
// icon without `spin` mounts no wrapper at all.
it('spin keeps the glyph mounted and turning', () => {
	const { container, rerender, queryByTestId } = render(<Icon name="refresh" spin />);
	const svg = container.querySelector('svg');
	expect(svg).not.toBeNull();
	expect(svg?.parentElement).toBe(queryByTestId('spin'));
	expect(queryByTestId('spin')).toHaveAttribute('data-active', 'true');
	rerender(<Icon name="refresh" spin={false} />);
	expect(container.querySelector('svg')).toBe(svg);
	expect(queryByTestId('spin')).toHaveAttribute('data-active', 'false');
	rerender(<Icon name="refresh" />);
	expect(queryByTestId('spin')).toBeNull();
});

it.each(Object.keys(TONE) as (keyof typeof TONE)[])(
	'paints the %s state in the tone map ink on native',
	(tone) => {
		render(<Icon name="check" variant={tone} />);
		expect(mockUseCSSVariable).toHaveBeenLastCalledWith(
			TONE[tone].text.replace('text-', '--color-')
		);
	}
);

// The count is measured from the glyph's own box (icon LEDGER line 8): the outer box carries the
// glyph's size class, so the badge's `-top-1 -right-0.5` lands on the same shoulder whatever the
// parent, a 44 button or a 48 drawer row (Paul, 2026-11-08: "too high, it does not look like the
// badge on the logs icon").
it('count puts the badge on a box the glyph size, pointer-less', () => {
	const { container } = render(<Icon name="health" size="xl" count={3} />);
	const outer = container.firstElementChild as HTMLElement;
	expect(outer.dataset.class?.split(' ')).toEqual(['relative', 'size-6']);
	expect(outer.children[0]?.getAttribute('data-class')).toContain('size-6');
	expect(outer.children[0]?.querySelector('svg')).not.toBeNull();
	const shoulder = outer.children[1] as HTMLElement;
	expect(shoulder.dataset.class).toBe('absolute -top-1 -right-0.5');
	expect(shoulder.dataset.pointerEvents).toBe('none');
	expect(screen.getByTestId('badge-text').textContent).toBe('3');
});

it('count past max reads N+, and 0 draws no badge text', () => {
	const { rerender } = render(<Icon name="notifications" count={120} />);
	expect(screen.getByTestId('badge-text').textContent).toBe('99+');
	rerender(<Icon name="notifications" count={0} />);
	expect(screen.queryByTestId('badge-text')).toBeNull();
});

it('no count mounts no extra box', () => {
	const { container } = render(<Icon name="check" />);
	expect(container.querySelectorAll('[data-class]')).toHaveLength(1);
	expect(container.querySelector('svg')?.parentElement).toBe(container.firstElementChild);
});
