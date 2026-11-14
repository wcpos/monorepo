import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { PosterThumb } from './index';

jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({
		className,
		testID,
		children,
	}: React.PropsWithChildren<{ className?: string; testID?: string }>) => (
		<div data-classes={className} data-testid={testID}>
			{children}
		</div>
	),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireMock('react-native').View },
}));
jest.mock('react-native-svg', () => {
	const ReactActual = jest.requireActual('react');
	const element =
		(name: string) =>
		({ children }: { children?: React.ReactNode }) =>
			ReactActual.createElement('i', { 'data-svg': name }, children);
	return {
		__esModule: true,
		default: element('svg'),
		Defs: element('defs'),
		LinearGradient: element('linear-gradient'),
		Rect: element('rect'),
		Stop: element('stop'),
	};
});
jest.mock('uniwind', () => ({ useCSSVariable: () => '#fff' }));
jest.mock('../icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) => {
		const { TextClassContext } = jest.requireActual('../text');
		const { cn } = jest.requireActual('../lib/utils');
		const inherited = React.useContext(TextClassContext);
		return <span data-icon={name} data-classes={cn(inherited, className)} />;
	},
}));
jest.mock('../image', () => ({
	Image: () => <span data-testid="picture" />,
}));

it('puts a folder bare in a tint, without a circle', () => {
	const { container } = render(
		<PosterThumb picture={{ kind: 'tint', tint: 2 }} mark={{ kind: 'folder' }} />
	);
	expect(container.querySelector('[data-icon="category"]')).not.toBeNull();
	expect(container.querySelector('[data-classes*="rounded-full"]')).toBeNull();
	// no ink provided on a tint: the bare glyph keeps the muted default
	expect(container.querySelector('[data-icon="category"]')?.getAttribute('data-classes')).toBe(
		'text-muted-foreground'
	);
});

it('puts a folder in a circle over a picture', () => {
	const { container } = render(
		<PosterThumb
			picture={{ kind: 'image', source: { uri: 'tea.jpg' } }}
			mark={{ kind: 'folder' }}
		/>
	);
	expect(screen.getByTestId('picture')).toBeTruthy();
	expect(
		container.querySelector('[data-classes*="rounded-full"] [data-icon="category"]')
	).not.toBeNull();
});

it('draws two cards behind a stacked thumb', () => {
	render(<PosterThumb picture={{ kind: 'tint', tint: 2 }} stacked />);
	expect(screen.getByTestId('poster-stack').children).toHaveLength(2);
});

it('one ink: a filled thumb provides primary foreground to its mark', () => {
	const { container } = render(
		<PosterThumb picture={{ kind: 'fill' }} mark={{ kind: 'folder' }} />
	);
	const nodes = container.querySelectorAll('[data-icon]');
	expect(nodes).toHaveLength(1);
	for (const node of nodes)
		expect(node.getAttribute('data-classes')).toBe('text-primary-foreground');
});
