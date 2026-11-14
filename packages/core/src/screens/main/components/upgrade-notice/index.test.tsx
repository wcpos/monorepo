/** @jest-environment jsdom */
import * as React from 'react';
import type { PressableProps, ViewProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { openExternalURL } from '@wcpos/utils/open-external-url';

import { STRIP_BODY_COUNT, UpgradeNotice, upgradeNoticeGround } from './index';

// RN-web drops className without Uniwind's transform; retain it at the native boundary.
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({ children, className, testID }: ViewProps) => (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	),
	Pressable: ({ children, className, testID, onPress, accessibilityLabel }: PressableProps) => (
		<button
			className={className}
			data-testid={testID}
			aria-label={accessibilityLabel}
			onClick={() => onPress?.({} as Parameters<NonNullable<PressableProps['onPress']>>[0])}
		>
			{typeof children === 'function' ? children({ pressed: false }) : children}
		</button>
	),
}));

let mockTheme = 'light';
jest.mock('uniwind', () => ({ useUniwind: () => ({ theme: mockTheme }) }));

let mockScreenSize = 'lg';
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockScreenSize === 'sm',
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('expo-haptics', () => ({}));
jest.mock('@rn-primitives/slot', () => ({}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));

beforeEach(() => {
	mockTheme = 'light';
	mockScreenSize = 'lg';
	jest.clearAllMocks();
	// The body is picked at random once per mount; pin the pick so the copy assertions are stable.
	jest.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
	jest.restoreAllMocks();
});

it('shows the free-plan copy and separate Pro actions on large layouts', () => {
	render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	expect(screen.getByTestId('upgrade-notice-banner').textContent).toContain(
		"You're on the free version of WCPOS. Pro adds refunds, card readers, stock and price editing, and order history."
	);
	expect(screen.getByTestId('upgrade-notice-more').textContent).toBe('See what Pro adds');
	expect(screen.getByTestId('upgrade-notice-upgrade').textContent).toBe('Upgrade to Pro');
	fireEvent.click(screen.getByTestId('upgrade-notice-more'));
	fireEvent.click(screen.getByTestId('upgrade-notice-upgrade'));
	expect(openExternalURL).toHaveBeenCalledTimes(2);
	expect(openExternalURL).toHaveBeenNthCalledWith(1, 'https://wcpos.com/pro');
	expect(openExternalURL).toHaveBeenNthCalledWith(2, 'https://wcpos.com/pro');
	expect(screen.getByTestId('upgrade-notice-banner').querySelector('button button')).toBeNull();
});

it('rotates the body between launches: every pick names a Pro feature and none names a Free one', () => {
	const bodies = new Set<string>();
	for (let i = 0; i < STRIP_BODY_COUNT; i++) {
		jest.spyOn(Math, 'random').mockReturnValue((i + 0.5) / STRIP_BODY_COUNT);
		const { unmount } = render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
		const body = screen
			.getByTestId('upgrade-notice-banner')
			.textContent!.replace("You're on the free version of WCPOS. ", '')
			.replace('See what Pro addsUpgrade to Pro', '');
		expect(body).toMatch(/^Pro /);
		expect(body).not.toMatch(/receipt template|held order|split payment|coupon/i);
		bodies.add(body);
		unmount();
	}
	expect(bodies.size).toBe(STRIP_BODY_COUNT);
});

it('keeps the body it picked at mount across rerenders', () => {
	const { rerender } = render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	const first = screen.getByTestId('upgrade-notice-banner').textContent;
	jest.spyOn(Math, 'random').mockReturnValue(0.99);
	rerender(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	expect(screen.getByTestId('upgrade-notice-banner').textContent).toBe(first);
});

it('dismisses the notice until next launch', () => {
	const setShowUpgrade = jest.fn();
	render(<UpgradeNotice setShowUpgrade={setShowUpgrade} />);
	const dismiss = screen.getByTestId('upgrade-notice-dismiss');
	expect(dismiss.getAttribute('aria-label')).toBe('Dismiss until next launch');
	fireEvent.click(dismiss);
	expect(setShowUpgrade).toHaveBeenCalledWith(false);
});

it('omits the body and more link on phones and shortens the title to fit beside the button', () => {
	mockScreenSize = 'sm';
	render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	const banner = screen.getByTestId('upgrade-notice-banner');
	expect(banner.textContent).toContain("You're on WCPOS Free.");
	expect(banner.textContent).not.toContain('free version of WCPOS');
	expect(banner.textContent).not.toContain('Pro adds refunds');
	expect(screen.queryByTestId('upgrade-notice-more')).toBeNull();
	expect(screen.getByTestId('upgrade-notice-upgrade').textContent).toBe('Upgrade to Pro');
	expect(screen.getByTestId('upgrade-notice-dismiss')).toBeTruthy();
});

it('uses the warning wash and default upgrade button on light themes', () => {
	mockTheme = 'light';
	render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	const banner = screen.getByTestId('upgrade-notice-banner');
	expect(banner.className).toContain('bg-warning-bg');
	expect(banner.className).toContain('border-warning/45');
	expect(screen.getByTestId('upgrade-notice-upgrade').className).not.toContain(
		'warning-foreground'
	);
});

it('keeps a solid yellow ground and ink outline button on dark themes', () => {
	mockTheme = 'dark';
	render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	const banner = screen.getByTestId('upgrade-notice-banner');
	expect(banner.className).toContain('bg-warning');
	expect(banner.className).not.toContain('bg-warning-bg');
	expect(banner.className).not.toContain('border-b');
	expect(screen.getByTestId('upgrade-notice-upgrade').className).toContain(
		'border-warning-foreground/60'
	);
});

it('shares the strip ground with its status-bar inset', () => {
	expect(upgradeNoticeGround(true)).toBe('bg-warning-bg');
	expect(upgradeNoticeGround(false)).toBe('bg-warning');
});
