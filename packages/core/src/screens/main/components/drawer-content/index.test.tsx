/**
 * @jest-environment jsdom
 *
 * The drawer's body in both presentations. The navigator calls `drawerContent(props)` inside
 * `Drawer`'s own render, above the providers `Drawer` renders, so every case here renders with
 * no drawer context and a `useDrawerProgress` that throws like the real one does without it.
 */
import * as React from 'react';

import { fireEvent, render, renderHook, screen } from '@testing-library/react';

import { DrawerContent } from './index';
import { DrawerPanelVisibilityProvider, DrawerPanelVisibilityReporter } from './panel-visibility';
import { useRailWidth } from './rail';

import type { DrawerContentComponentProps } from 'expo-router/drawer';

let mockOS = 'web';
// The live `--spacing`; unset reads as the Regular step's 4.
let mockSpacing: string | number | undefined;
jest.mock('uniwind', () => ({ useCSSVariable: () => mockSpacing }));
jest.mock('@wcpos/utils/platform', () => ({
	Platform: {
		get OS() {
			return mockOS;
		},
	},
}));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router/drawer', () => ({
	DrawerContentScrollView: (props: {
		children?: React.ReactNode;
		testID?: string;
		className?: string;
		importantForAccessibility?: string;
		accessibilityElementsHidden?: boolean;
		contentContainerStyle?: object;
	}) => (
		<div
			data-testid="drawer-scroll"
			data-content-style={JSON.stringify(props.contentContainerStyle)}
			data-panel={props.testID}
			data-class={props.className}
			data-important={props.importantForAccessibility}
			data-elements-hidden={String(props.accessibilityElementsHidden)}
		>
			{props.children}
		</div>
	),
	useDrawerProgress: () => {
		throw new Error("Couldn't find a drawer. Is your component inside a drawer?");
	},
	getDrawerStatusFromState: (state: { history?: { type: string; status?: string }[] }) =>
		state.history?.findLast?.((entry) => entry.type === 'drawer')?.status ?? 'closed',
}));
jest.mock('expo-router/react-navigation', () => ({
	useIsFocused: () => true,
	CommonActions: { navigate: (payload: object) => ({ type: 'NAVIGATE', payload }) },
	DrawerActions: { closeDrawer: () => ({ type: 'CLOSE_DRAWER' }) },
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) => {
		const { TextClassContext } = jest.requireActual('@wcpos/components/text');
		const { cn } = jest.requireActual('@wcpos/components/lib/utils');
		return (
			<span data-icon={name} data-classes={cn(React.useContext(TextClassContext), className)} />
		);
	},
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <div data-testid="tooltip">{children}</div>,
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: () => null,
}));
// The bell left the drawer (2026-10-28): were it imported again, this mock would show it.
jest.mock('../notification-bell/notification-bell', () => ({
	NotificationBell: () => <div data-testid="bell" />,
}));
jest.mock('./version', () => ({ Version: () => <div data-testid="version" /> }));
const names = ['(pos)', 'orders', 'health', 'settings'];
const dispatch = jest.fn();
const drawerProps = {
	state: {
		key: 'drawer-1',
		index: 0,
		routeNames: names,
		routes: names.map((name) => ({ key: `${name}-1`, name })),
		history: [{ type: 'route', key: '(pos)-1' }],
		type: 'drawer',
		stale: false,
	},
	navigation: { dispatch },
	descriptors: Object.fromEntries(
		names.map((name) => [
			`${name}-1`,
			{
				options: {
					title: name === '(pos)' ? 'POS' : name,
					...(name === 'health' ? { drawerItemStyle: [{ marginTop: 'auto' }] } : null),
				},
			},
		])
	),
} as unknown as DrawerContentComponentProps;

function Drawer({
	presentation,
	open = false,
}: {
	presentation: 'rail' | 'front';
	open?: boolean;
}) {
	return (
		<DrawerPanelVisibilityProvider>
			{open && <DrawerPanelVisibilityReporter status="open" />}
			<DrawerContent
				{...drawerProps}
				presentation={presentation}
				icons={{ '(pos)': 'register', orders: 'receipt', health: 'health', settings: 'settings' }}
				badges={{ health: <span data-testid="health-badge" /> }}
			/>
		</DrawerPanelVisibilityProvider>
	);
}

const scroll = () => screen.getByTestId('drawer-scroll');
const item = (name: string) => screen.getByTestId(`drawer-item-${name}`);

beforeEach(() => {
	mockOS = 'web';
	dispatch.mockClear();
});

describe.each(['rail', 'front'] as const)('the %s', (presentation) => {
	const rail = presentation === 'rail';

	it('renders every route as a nav item, names it, and announces the selected one', () => {
		const { container } = render(<Drawer presentation={presentation} />);
		expect(item('pos').getAttribute('aria-label')).toBe('POS');
		expect(item('pos').getAttribute('aria-selected')).toBe('true');
		expect(item('orders').getAttribute('aria-selected')).toBe('false');
		// The rail is icon-only; the front drawer shows the label.
		expect(!!screen.queryByTestId('drawer-item-pos-label')).toBe(!rail);
		// NavItem paints the tint from the route's icon name.
		const tint = (name: string) =>
			container.querySelector(`[data-icon="${name}"]`)?.getAttribute('data-classes');
		expect(tint('register')).toContain('text-rail-selected-foreground');
		expect(tint('receipt')).toContain('text-sidebar-foreground');
		expect(
			screen.getByTestId('drawer-bottom-group').contains(screen.getByTestId('health-badge'))
		).toBe(true);
	});

	it('navigates to another route, or closes on the focused one, with one dispatch each', () => {
		render(<Drawer presentation={presentation} />);
		fireEvent.click(item('orders'));
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenLastCalledWith({
			type: 'NAVIGATE',
			payload: { name: 'orders', merge: true },
			target: 'drawer-1',
		});
		fireEvent.click(item('pos'));
		expect(dispatch).toHaveBeenCalledTimes(2);
		expect(dispatch).toHaveBeenLastCalledWith({ type: 'CLOSE_DRAWER', target: 'drawer-1' });
	});

	it('groups the routes from the auto margin down at the bottom, with the version', () => {
		render(<Drawer presentation={presentation} />);
		const top = screen.getByTestId('drawer-top-group');
		const bottom = screen.getByTestId('drawer-bottom-group');
		for (const name of ['pos', 'orders']) expect(top.contains(item(name))).toBe(true);
		for (const name of ['health', 'settings']) expect(bottom.contains(item(name))).toBe(true);
		expect(screen.getByTestId('version')).toBeTruthy();
	});

	it(`${rail ? 'never hides' : 'hides'} the panel from assistive tech while it is settled closed`, () => {
		const { unmount } = render(<Drawer presentation={presentation} />);
		// The E2E flows wait for a front drawer to close, never for the always-on rail.
		expect(scroll().getAttribute('data-panel')).toBe(
			rail ? 'drawer-panel-permanent' : 'drawer-panel'
		);
		// The vendored scroll view drops a class: the layout owns width and colour.
		expect(scroll().getAttribute('data-class')).toBeNull();
		expect(scroll().getAttribute('data-important')).toBe(rail ? 'auto' : 'no-hide-descendants');
		expect(scroll().getAttribute('data-elements-hidden')).toBe(String(!rail));
		unmount();

		render(<Drawer presentation={presentation} open />);
		expect(scroll().getAttribute('data-important')).toBe('auto');
		expect(scroll().getAttribute('data-elements-hidden')).toBe('false');
	});
});

it.each(['web', 'ios'])('wraps the rail items in a tooltip on web only (%s)', (os) => {
	mockOS = os;
	render(<Drawer presentation="rail" />);
	expect(screen.queryAllByTestId('tooltip')).toHaveLength(os === 'web' ? names.length : 0);
});

// Every bar carries the bell since #3018 and the avatar since 2026-10-29, so neither drawer does:
// the rail and the front drawer list pages only (Paul: the avatar opens no page).
it.each(['rail', 'front'] as const)('has no avatar and no bell in the %s', (presentation) => {
	render(<Drawer presentation={presentation} />);
	expect(screen.queryByTestId('register-bar-avatar')).toBeNull();
	expect(screen.queryByTestId('bell')).toBeNull();
});

// The panel insets its items by the dense-strip gutter, 8 at Regular, from every edge on both
// presentations (the top too: Paul, 2026-10-28), and the items carry no margin of their own
// (CODING_STANDARDS § Gutters).
it.each(['rail', 'front'] as const)('insets the %s items from its own sides', (presentation) => {
	mockSpacing = undefined;
	render(<Drawer presentation={presentation} />);
	expect(JSON.parse(scroll().dataset.contentStyle!)).toMatchObject({
		paddingTop: 8,
		paddingBottom: 8,
		paddingStart: 8,
		paddingEnd: 8,
	});
	expect(item('orders').parentElement?.className ?? '').not.toContain('mx-2');
});

it('renders with no visibility provider either', () => {
	render(<DrawerContent {...drawerProps} presentation="front" icons={{}} />);
	expect(scroll()).toBeTruthy();
});

it('sizes the rail at 16 spacing units of the live step, 64 when there is no step', () => {
	// The items are `size-12`, so a fixed 64 left 2 px beside them at Spacious (Codex, #2795).
	const width = (spacing: string | number | undefined) => {
		mockSpacing = spacing;
		return renderHook(() => useRailWidth()).result.current;
	};
	expect(width(5)).toBe(80);
	expect(width('3.5px')).toBe(56);
	expect(width(undefined)).toBe(64);
});
