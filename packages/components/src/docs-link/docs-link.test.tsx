import { readFileSync } from 'node:fs';

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

it('renders code after the label in muted colour with the arrow last', () => {
	const { container } = render(
		<DocsLink href="https://docs.wcpos.com" code="HOST121">
			Learn more
		</DocsLink>
	);
	const parts = container.querySelectorAll('span');
	expect(parts).toHaveLength(3);
	expect(parts[0].textContent).toBe('Learn more');
	expect(parts[1].textContent).toBe(' · HOST121');
	expect(parts[1]).toHaveClass('text-muted-foreground');
	expect(parts[2]).toHaveAttribute('data-icon', 'arrowUpRight');
});

it('wraps a long label instead of truncating it', () => {
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	expect(source).toContain('flex-wrap');
	expect(source.match(/numberOfLines=\{0\}/g)).toHaveLength(2);
});

it('renders only the label and arrow without a code', () => {
	const { container } = render(<DocsLink href="https://docs.wcpos.com">Learn more</DocsLink>);
	const parts = container.querySelectorAll('span');
	expect(parts).toHaveLength(2);
	expect(parts[0].textContent).toBe('Learn more');
	expect(parts[1]).toHaveAttribute('data-icon', 'arrowUpRight');
});
