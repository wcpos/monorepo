import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DocsLink } from './index';

const mockOpenExternalURL = jest.fn();

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	Pressable: ({ children, testID, onPress, role, ...props }: any) =>
		React.createElement(
			'button',
			{ ...props, role, 'data-testid': testID, onClick: onPress },
			typeof children === 'function' ? children({ pressed: false }) : children
		),
	View: (props: any) => React.createElement('div', props),
	Text: ({ children, ...props }: any) => React.createElement('span', props, children),
	StyleSheet: { create: (styles: any) => styles },
}));
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: any) => children,
}));
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../hstack', () => ({
	HStack: ({ children, ...props }: any) => React.createElement('div', props, children),
}));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name }, name),
}));
jest.mock('../loader', () => ({
	Loader: () => null,
}));
jest.mock('@wcpos/utils/open-external-url', () => ({
	openExternalURL: (...args: unknown[]) => mockOpenExternalURL(...args),
}));

describe('DocsLink', () => {
	beforeEach(() => mockOpenExternalURL.mockClear());

	it('renders the label with the trailing angled arrow and opens the docs URL', () => {
		render(
			<DocsLink testID="docs-link" href="https://docs.wcpos.com/products/sync">
				How syncing works
			</DocsLink>
		);

		const link = screen.getByTestId('docs-link');
		expect(link.getAttribute('role')).toBe('link');
		expect(link.textContent).toContain('How syncing works');
		expect(link.querySelector('[data-icon="arrowUpRight"]')).not.toBeNull();

		fireEvent.click(link);
		expect(mockOpenExternalURL).toHaveBeenCalledWith('https://docs.wcpos.com/products/sync');
	});
});
