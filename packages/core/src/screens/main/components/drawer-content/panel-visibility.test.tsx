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
	useReassertDrawerPanelHidden,
} from './panel-visibility';

function Harness({ status }: { status: DrawerPanelStatus }) {
	return (
		<DrawerPanelVisibilityProvider>
			<Readout />
			<Reasserter />
			<DrawerPanelVisibilityReporter status={status} />
		</DrawerPanelVisibilityProvider>
	);
}

/**
 * Stands in for the animated-progress reaction in `DrawerContent`: fires the re-assert the way a
 * cancelled opening swipe would.
 */
function Reasserter() {
	const reassert = useReassertDrawerPanelHidden();
	return <button data-testid="reassert" onClick={reassert} />;
}

function fireReassert(container: HTMLElement) {
	act(() => {
		container.querySelector<HTMLButtonElement>('[data-testid="reassert"]')?.click();
	});
	// The drop is restored from a deferred timer so it lands as its own commit.
	act(() => {
		jest.advanceTimersByTime(1);
	});
}

/** Every value `useDrawerPanelHidden` has published, so a test can see the drop-and-restore. */
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

	it('re-applies the hide after a cancelled opening swipe', () => {
		// The swipe never changes the navigation state, so the reporter does not re-run. Without
		// the re-assert the static `display: 'none'` is never committed again and the guard
		// silently disarms — which is exactly how #1691 could come back.
		const { container } = render(<Harness status="closed" />);
		act(() => {
			jest.advanceTimersByTime(DRAWER_CLOSE_SETTLE_MS + 1);
		});
		expect(readHidden(container)).toBe('true');
		publishedHidden.length = 0;

		fireReassert(container);

		// Dropped for one commit — a real prop change the renderer cannot diff away — then hidden
		// again. Publishing `true` twice in a row would be the no-op that lets the bug back in.
		expect(publishedHidden).toEqual([false, true]);
		expect(readHidden(container)).toBe('true');
	});

	it('does not hide an open drawer when a re-assert arrives', () => {
		const { container } = render(<Harness status="open" />);
		expect(readHidden(container)).toBe('false');

		publishedHidden.length = 0;
		fireReassert(container);

		expect(publishedHidden).toEqual([]);
		expect(readHidden(container)).toBe('false');
	});

	it('reports visible with no provider, so a tree without the guard is unchanged', () => {
		const { container } = render(<Readout />);

		expect(readHidden(container)).toBe('false');
	});
});
