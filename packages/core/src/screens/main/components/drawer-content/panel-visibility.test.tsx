/**
 * @jest-environment jsdom
 *
 * monorepo#1691: on iOS the drawer panel re-appeared over the screen the app had already
 * navigated to, ~16 s after the tap, with no touch and no drawer action in between — the
 * close was only ever an animated transform, and a late React commit rendered the panel back
 * at a stale position. These tests pin the guard that makes a closed drawer a layout fact:
 * once the navigator says "closed" and the close animation has had time to finish, the panel
 * is hidden, and nothing about the animation can bring it back.
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import {
	DRAWER_CLOSE_SETTLE_MS,
	type DrawerPanelStatus,
	DrawerPanelVisibilityProvider,
	DrawerPanelVisibilityReporter,
	useDrawerPanelHidden,
} from './panel-visibility';

function Harness({ status }: { status: DrawerPanelStatus }) {
	return (
		<DrawerPanelVisibilityProvider>
			<Readout />
			<DrawerPanelVisibilityReporter status={status} />
		</DrawerPanelVisibilityProvider>
	);
}

/** Every value `useDrawerPanelHidden` has published, so a test can see a hide that flickers. */
const publishedHidden: boolean[] = [];

function Readout() {
	const hidden = useDrawerPanelHidden();
	if (publishedHidden[publishedHidden.length - 1] !== hidden) publishedHidden.push(hidden);
	return <div data-testid="hidden">{String(hidden)}</div>;
}

const readHidden = (container: HTMLElement) =>
	container.querySelector('[data-testid="hidden"]')?.textContent;

describe('drawer panel visibility', () => {
	beforeEach(() => {
		publishedHidden.length = 0;
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
	});

	it('hides the panel once the drawer has been closed for the settle window', () => {
		const { container } = render(<Harness status="closed" />);

		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS + 1);
		});

		expect(readHidden(container)).toBe('true');
	});

	it('leaves the panel in layout while the close animation is still running', () => {
		// Opened, then closed: the panel must stay in layout long enough for the close
		// animation to be seen. Hiding it on the state change alone would cut the slide-out.
		const { container, rerender } = render(<Harness status="open" />);
		expect(readHidden(container)).toBe('false');

		rerender(<Harness status="closed" />);
		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS - 1);
		});
		expect(readHidden(container)).toBe('false');

		act(() => {
			jest.advanceTimersByTime(2);
		});
		expect(readHidden(container)).toBe('true');
	});

	it('un-hides the panel as soon as the drawer opens', () => {
		const { container, rerender } = render(<Harness status="closed" />);
		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS + 1);
		});
		expect(readHidden(container)).toBe('true');

		rerender(<Harness status="open" />);
		// No timer: the open animation needs something to slide in on the very next frame.
		expect(readHidden(container)).toBe('false');
	});

	it('does not hide a drawer that is re-opened inside the settle window', () => {
		const { container, rerender } = render(<Harness status="open" />);

		rerender(<Harness status="closed" />);
		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS / 2);
		});

		rerender(<Harness status="open" />);
		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS * 2);
		});

		expect(readHidden(container)).toBe('false');
	});

	it('reports hidden by default, before any status is seen', () => {
		// The app boots with the drawer closed; an un-hidden closed panel is the state the
		// guard exists to prevent, so it must not be the starting one.
		const { container } = render(
			<DrawerPanelVisibilityProvider>
				<Readout />
			</DrawerPanelVisibilityProvider>
		);

		expect(readHidden(container)).toBe('true');
	});

	it('never drops the hide of a settled-closed panel on a state echo', () => {
		// The old "re-assert" path dropped the hide for one commit whenever the animated progress
		// returned to 0, assuming the dropped frame showed nothing. On a busy JS thread the drop
		// landed seconds late and rendered the panel back at the stale open transform (Android
		// flow 05, run 33725936595). A closed-status re-render must publish `true` and nothing else.
		const { container, rerender } = render(<Harness status="closed" />);
		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS + 1);
		});
		expect(readHidden(container)).toBe('true');
		publishedHidden.length = 0;

		rerender(<Harness status="closed" />);
		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS + 1);
		});

		// The readout re-pushes on its first render after the reset, so the only thing that
		// matters is that `false` never appears.
		expect(publishedHidden).not.toContain(false);
		expect(readHidden(container)).toBe('true');
	});

	it('reports visible with no provider, so a tree without the guard is unchanged', () => {
		const { container } = render(<Readout />);

		expect(readHidden(container)).toBe('false');
	});
});
