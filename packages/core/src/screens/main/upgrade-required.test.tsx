/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { UpgradeRequired } from './upgrade-required';

jest.mock('@wcpos/components/button', () => {
	const { Pressable, Text } = jest.requireActual('react-native');
	return { Button: Pressable, ButtonText: Text };
});
// The docs link's system-browser hand-off (expo-linking) is outside this test.
jest.mock('@wcpos/components/docs-link', () => {
	const { Text } = jest.requireActual('react-native');
	return {
		DocsLink: ({ testID, href, code }: { testID?: string; href: string; code?: string }) => (
			<Text testID={testID}>{`${href} ${code}`}</Text>
		),
	};
});
// SVG runtimes (the mark and the glyph) are outside this composition test.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/logo', () => ({ Logo: () => null }));
jest.mock('../../contexts/translations', () => {
	const { createTestT } =
		jest.requireActual<typeof import('../../../jest/translate')>('../../../jest/translate');
	return { useT: () => createTestT() };
});

const renderGate = (props: Partial<React.ComponentProps<typeof UpgradeRequired>> = {}) => {
	const onCheckAgain = jest.fn();
	const onLogout = jest.fn();
	render(
		<UpgradeRequired checking={false} onCheckAgain={onCheckAgain} onLogout={onLogout} {...props} />
	);
	return { onCheckAgain, onLogout };
};

describe('UpgradeRequired', () => {
	it('is the gate screen naming the plugin, with Check again, logout and the AUTH331 docs link', () => {
		renderGate();

		expect(screen.getByTestId('upgrade-required-screen')).toBeTruthy();
		expect(screen.getByTestId('upgrade-required-screen-title').textContent).toBe(
			'Update the WCPOS plugin on your WordPress site.'
		);
		expect(screen.getByTestId('upgrade-required-check-again').textContent).toBe('Check again');
		expect(screen.getByTestId('upgrade-required-logout')).toBeTruthy();
		expect(screen.getByTestId('upgrade-required-docs-link-AUTH331').textContent).toBe(
			'https://docs.wcpos.com/error-codes/AUTH331 AUTH331'
		);
	});

	it('Check again asks the store again', () => {
		const { onCheckAgain } = renderGate();

		fireEvent.click(screen.getByTestId('upgrade-required-check-again'));

		expect(onCheckAgain).toHaveBeenCalledTimes(1);
	});

	it('while checking, the button reads Checking…, is disabled, and AUTH331 is not shown yet', () => {
		const { onCheckAgain } = renderGate({ checking: true });

		const button = screen.getByTestId('upgrade-required-check-again');
		expect(button.textContent).toBe('Checking…');
		expect(button.getAttribute('aria-disabled')).toBe('true');
		fireEvent.click(button);
		expect(onCheckAgain).not.toHaveBeenCalled();
		expect(screen.queryByTestId('upgrade-required-docs-link-AUTH331')).toBeNull();
	});

	it('Logout calls onLogout', () => {
		const { onLogout } = renderGate();

		fireEvent.click(screen.getByTestId('upgrade-required-logout'));

		expect(onLogout).toHaveBeenCalledTimes(1);
	});
});
