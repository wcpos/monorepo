import * as React from 'react';

import { act, render, renderHook, screen } from '@testing-library/react';

import { Dialog, DialogContent } from '../../dialog';
import { DeviceScope } from '../device';
import { usePortalContainer } from '../portal-container';
import { OverlayHost } from './host';
import { OverlayHostProvider, useOverlayHost } from './index';

import type * as Primitive from '@rn-primitives/dialog';

const mockPortals: Primitive.PortalProps[] = [];
jest.mock('@rn-primitives/dialog', () => ({
	...jest.requireActual('@rn-primitives/dialog'),
	// Records where the dialog portals and draws nothing: the shell is not under test here.
	Portal: (props: Primitive.PortalProps) => {
		mockPortals.push(props);
		return null;
	},
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../icon', () => ({ Icon: () => null }));
jest.mock('../../loader', () => ({ Loader: () => null }));
jest.mock('../../keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../portal', () => ({
	PortalHost: ({ name }: { name?: string }) => <div data-testid={`portal-host-${name}`} />,
}));

beforeEach(() => {
	mockPortals.length = 0;
});

/** The scene a drawer page provides, with the till's host nested in it. */
function Till({ phone = false, children }: React.PropsWithChildren<{ phone?: boolean }>) {
	return (
		<DeviceScope phone={phone}>
			<OverlayHostProvider name="scene:(pos)" phoneUsesRoot>
				<OverlayHostProvider name="pos">{children}</OverlayHostProvider>
			</OverlayHostProvider>
		</DeviceScope>
	);
}

function hostOf(content: React.ReactElement, wrap: (ui: React.ReactElement) => React.ReactElement) {
	render(wrap(<Dialog open>{content}</Dialog>));
	return mockPortals.at(-1)?.hostName;
}

// A dialog that names no host opens on the nearest one a layout provides, so the till's sheets
// stay in the till without saying so; with none provided, the root.
it('takes the nearest provided host, and the root with none', () => {
	expect(renderHook(() => useOverlayHost(), { wrapper: Till }).result.current).toBe('pos');
	expect(renderHook(() => useOverlayHost('outermost'), { wrapper: Till }).result.current).toBe(
		'scene:(pos)'
	);
	expect(renderHook(() => useOverlayHost()).result.current).toBeUndefined();
	expect(hostOf(<DialogContent>Task</DialogContent>, (ui) => <Till>{ui}</Till>)).toBe('pos');
	expect(hostOf(<DialogContent>Task</DialogContent>, (ui) => ui)).toBeUndefined();
});

// The explicit prop is a public option a ruling made some uses of: a name wins over the ambient
// host, and `null` still selects the root (ledger line 27).
it.each([
	['a named host', 'scene:(pos)', 'scene:(pos)'],
	['null', null, undefined],
] as const)('lets %s win over the ambient host', (_case, portalHost, hostName) => {
	expect(
		hostOf(<DialogContent portalHost={portalHost}>Task</DialogContent>, (ui) => <Till>{ui}</Till>)
	).toBe(hostName);
});

// A page host sits beside a rail the phone does not have: on a phone its sheets take the root.
// The till's own host keeps its sheets on every size.
it.each([
	[false, 'scene:orders', 'pos'],
	[true, undefined, 'pos'],
])('on a phone (%s) a page host gives %s and the till %s', (phone, page, till) => {
	function Page({ children }: React.PropsWithChildren) {
		return (
			<DeviceScope phone={phone}>
				<OverlayHostProvider name="scene:orders" phoneUsesRoot>
					{children}
				</OverlayHostProvider>
			</DeviceScope>
		);
	}
	expect(hostOf(<DialogContent>Task</DialogContent>, (ui) => <Page>{ui}</Page>)).toBe(page);
	expect(hostOf(<DialogContent>Task</DialogContent>, (ui) => <Till phone={phone}>{ui}</Till>)).toBe(
		till
	);
	expect(
		renderHook(() => useOverlayHost('outermost'), {
			wrapper: ({ children }) => <Till phone={phone}>{children}</Till>,
		}).result.current
	).toBe(page && 'scene:(pos)');
});

// An unnamed provider names the root (the title bar before any page has focused).
it('names the root with an unnamed provider', () => {
	const { result } = renderHook(() => useOverlayHost(), {
		wrapper: ({ children }) => (
			<OverlayHostProvider name={undefined}>{children}</OverlayHostProvider>
		),
	});
	expect(result.current).toBeUndefined();
});

// The three host steps in one place: the web container under the host's name (dialog ledger 7),
// the native PortalHost after the children while active, and the name to everything below.
it('registers its web container and mounts its native host only while active', () => {
	const container = renderHook(() => usePortalContainer('scene:orders'));
	function Probe() {
		const host = useOverlayHost();
		return <span data-testid="probe">{host}</span>;
	}
	const wide = ({ children }: React.PropsWithChildren) => (
		<DeviceScope phone={false}>{children}</DeviceScope>
	);
	const { rerender, unmount } = render(
		<OverlayHost name="scene:orders" phoneUsesRoot active>
			<Probe />
		</OverlayHost>,
		{ wrapper: wide }
	);
	expect(container.result.current).toBeInstanceOf(HTMLElement);
	expect(container.result.current?.contains(screen.getByTestId('portal-host-scene:orders'))).toBe(
		true
	);
	expect(screen.getByTestId('probe').textContent).toBe('scene:orders');
	rerender(
		<OverlayHost name="scene:orders" phoneUsesRoot active={false}>
			<Probe />
		</OverlayHost>
	);
	expect(screen.queryByTestId('portal-host-scene:orders')).toBeNull();
	expect(container.result.current).toBeInstanceOf(HTMLElement);
	act(() => unmount());
	expect(container.result.current).toBeUndefined();
});
