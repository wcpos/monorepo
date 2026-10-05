import * as React from 'react';
import type { ViewProps } from 'react-native';

import { act, render, screen } from '@testing-library/react';

type TimingCall = { toValue: number; done: (finished: boolean) => void };
const mockTimings: TimingCall[] = [];
const mockShared: { value: number }[] = [];
const mockStyles: (() => { opacity?: number; transform: { translateX: number }[] })[] = [];
const mockLayouts: NonNullable<ViewProps['onLayout']>[] = [];

const flatten = (style: unknown): Record<string, unknown> =>
	Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	View: ({ children, onLayout, testID }: ViewProps) => {
		if (onLayout) mockLayouts.push(onLayout);
		return <div data-testid={testID}>{children}</div>;
	},
}));
jest.mock('react-native-worklets', () => ({
	scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: {
		// The ref is the DOM node, as on web: the stack asks the leaving pane what it contains.
		View: React.forwardRef(function AnimatedView(
			{ children, className, style, ...rest }: ViewProps & { className?: string },
			ref: React.Ref<HTMLDivElement>
		) {
			const flat = flatten(style);
			return (
				<div
					ref={ref}
					data-testid={className?.includes('absolute') ? 'detail-pane' : 'root-pane'}
					data-visibility={(flat.visibility as string) ?? 'visible'}
					data-pointer={flat.pointerEvents as string}
					aria-hidden={rest['aria-hidden']}
				>
					{children}
				</div>
			);
		}),
	},
	Easing: { bezier: () => 'ease' },
	ReduceMotion: { System: 'system' },
	useAnimatedStyle: (factory: (typeof mockStyles)[number]) => {
		mockStyles.push(factory);
		return {};
	},
	useSharedValue: (value: number) => {
		const shared = React.useRef({ value }).current;
		if (!mockShared.includes(shared)) mockShared.push(shared);
		return shared;
	},
	withTiming: (toValue: number, _config: unknown, done: (finished: boolean) => void) => {
		mockTimings.push({ toValue, done });
		return toValue;
	},
}));

// eslint-disable-next-line import/first
import { PaneStack } from './index';

function Stage({ detail }: { detail: string | null }) {
	return (
		<PaneStack detail={detail} renderDetail={(name) => <span data-testid="detail">{name}</span>}>
			<span data-testid="root">products</span>
		</PaneStack>
	);
}

beforeEach(() => {
	mockTimings.length = 0;
	mockShared.length = 0;
	mockStyles.length = 0;
	mockLayouts.length = 0;
	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
		callback(0);
		return 1;
	});
});
afterEach(() => jest.restoreAllMocks());

const finish = (toValue: number, finished = true) =>
	act(() => {
		const timing = mockTimings.filter((call) => call.toValue === toValue).at(-1);
		timing!.done(finished);
	});

it('shows only the root at rest and starts no push on mount', () => {
	render(<Stage detail={null} />);
	expect(screen.getByTestId('root')).toBeTruthy();
	expect(screen.queryByTestId('detail')).toBeNull();
	// Nothing animates in on mount: the only timing is the no-op settle to the resting value.
	expect(mockTimings.map((call) => call.toValue)).toEqual([0]);
	expect(screen.getByTestId('root-pane').getAttribute('aria-hidden')).toBe('false');
});

it('a push keeps the root mounted under the detail and hides it only once covered', () => {
	const { rerender } = render(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	expect(screen.getByTestId('detail').textContent).toBe('Hoodie');
	// The pane it came from is still there to travel off with it.
	expect(screen.getByTestId('root')).toBeTruthy();
	expect(mockTimings.at(-1)!.toValue).toBe(1);
	const root = screen.getByTestId('root-pane');
	expect(root.getAttribute('aria-hidden')).toBe('true');
	expect(root.dataset.pointer).toBe('none');
	// Still visible while it is sliding away…
	expect(root.dataset.visibility).toBe('visible');
	finish(1);
	// …and out of the tab order and accessibility tree once the detail covers it.
	expect(screen.getByTestId('root-pane').dataset.visibility).toBe('hidden');
	expect(screen.getByTestId('root')).toBeTruthy();
});

it('a pop uncovers the root at once and keeps the detail on stage until it has left', () => {
	const { rerender } = render(<Stage detail="Hoodie" />);
	finish(1);
	rerender(<Stage detail={null} />);
	expect(screen.getByTestId('root-pane').dataset.visibility).toBe('visible');
	expect(screen.getByTestId('detail').textContent).toBe('Hoodie');
	expect(screen.getByTestId('detail-pane').dataset.pointer).toBe('none');
	expect(mockTimings.at(-1)!.toValue).toBe(0);
	finish(0);
	expect(screen.queryByTestId('detail')).toBeNull();
});

it('a pop interrupted by a new push leaves the detail mounted', () => {
	const { rerender } = render(<Stage detail="Hoodie" />);
	finish(1);
	rerender(<Stage detail={null} />);
	rerender(<Stage detail="Hoodie" />);
	// The cancelled pop reports `finished: false`; it must not unmount what is being pushed.
	finish(0, false);
	expect(screen.getByTestId('detail').textContent).toBe('Hoodie');
	// And the root is not hidden again until the new push lands.
	expect(screen.getByTestId('root-pane').dataset.visibility).toBe('visible');
});

it('moves both panes from one progress value, clamped so neither can step backwards', () => {
	render(<Stage detail="Hoodie" />);
	const [progress, width] = mockShared;
	act(() => mockLayouts.at(-1)!({ nativeEvent: { layout: { width: 400 } } } as never));
	expect(width.value).toBe(400);
	const [rootStyle, detailStyle] = mockStyles.slice(-2);

	progress.value = 0;
	expect(detailStyle().transform[0].translateX).toBe(400);
	expect(rootStyle()).toEqual({ opacity: 1, transform: [{ translateX: -0 }] });

	progress.value = 1;
	expect(detailStyle().transform[0].translateX).toBe(0);
	// Decision 32: the covered pane drifts 24% of the stage and dims to 0.35.
	expect(rootStyle().transform[0].translateX).toBe(-96);
	expect(rootStyle().opacity).toBeCloseTo(0.35);

	// A bezier asked for a time just outside its range extrapolates.
	progress.value = -0.05;
	expect(detailStyle().transform[0].translateX).toBe(400);
	progress.value = 1.05;
	expect(detailStyle().transform[0].translateX).toBe(0);
});

// The pane's breadcrumb takes focus when it mounts, in a passive effect, as the real one does.
function Crumb({ children }: { children: string }) {
	const crumb = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => crumb.current?.focus(), []);
	return <button ref={crumb}>{children}</button>;
}

it('hides a leaving detail from the accessibility tree and gives focus back to what opened it', () => {
	const stage = (detail: string | null) => (
		<>
			<button data-testid="opener" />
			<input data-testid="search" />
			<PaneStack detail={detail} renderDetail={(value) => <Crumb>{value}</Crumb>}>
				<span>root</span>
			</PaneStack>
		</>
	);
	const { rerender } = render(stage(null));
	screen.getByTestId('opener').focus();
	rerender(stage('variations'));
	expect(screen.getByTestId('detail-pane').getAttribute('aria-hidden')).toBe('false');
	// The crumb took focus on mount; the opener on record is still the row, not the crumb.
	expect(document.activeElement).toBe(screen.getByText('variations'));
	rerender(stage(null));
	// Still on stage for the pop, but already gone to a screen reader.
	expect(screen.getByTestId('detail-pane').getAttribute('aria-hidden')).toBe('true');
	expect(document.activeElement).toBe(screen.getByTestId('opener'));
	// Focus that moved somewhere live before the pop (typing in a search field closed the
	// detail) stays where it is.
	rerender(stage('variations'));
	screen.getByTestId('search').focus();
	rerender(stage(null));
	expect(document.activeElement).toBe(screen.getByTestId('search'));
});
