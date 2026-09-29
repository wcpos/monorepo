/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { openExternalURL } from '@wcpos/utils/open-external-url';

import { UpgradeNotice } from './upgrade-notice';

let mockScreenSize = 'lg';
jest.mock('../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockScreenSize }),
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
	mockScreenSize = 'lg';
	jest.clearAllMocks();
});

it('shows the free-plan copy and separate Pro actions on large layouts', () => {
	render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	expect(screen.getByTestId('upgrade-notice-banner').textContent).toContain(
		"You're on the free version of WCPOS. Pro adds receipt templates, held orders, reports and priority support."
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

it('dismisses the notice until next launch', () => {
	const setShowUpgrade = jest.fn();
	render(<UpgradeNotice setShowUpgrade={setShowUpgrade} />);
	const dismiss = screen.getByTestId('upgrade-notice-dismiss');
	expect(dismiss.getAttribute('aria-label')).toBe('Dismiss until next launch');
	fireEvent.click(dismiss);
	expect(setShowUpgrade).toHaveBeenCalledWith(false);
});

it('omits the body and more link on phones while keeping the title and controls', () => {
	mockScreenSize = 'sm';
	render(<UpgradeNotice setShowUpgrade={jest.fn()} />);
	const banner = screen.getByTestId('upgrade-notice-banner');
	expect(banner.textContent).toContain("You're on the free version of WCPOS.");
	expect(banner.textContent).not.toContain('Pro adds receipt templates');
	expect(screen.queryByTestId('upgrade-notice-more')).toBeNull();
	expect(screen.getByTestId('upgrade-notice-upgrade').textContent).toBe('Upgrade to Pro');
	expect(screen.getByTestId('upgrade-notice-dismiss')).toBeTruthy();
});
