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
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
jest.mock('../image', () => ({
	Image: () => <span data-testid="picture" />,
}));

it('puts a folder bare in a tint, without a circle', () => {
	const { container } = render(
		<PosterThumb picture={{ kind: 'tint', tint: 2 }} mark={{ kind: 'folder' }} />
	);
	expect(container.querySelector('[data-icon="folder"]')).not.toBeNull();
	expect(container.querySelector('[data-classes*="rounded-full"]')).toBeNull();
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
		container.querySelector('[data-classes*="rounded-full"] [data-icon="folder"]')
	).not.toBeNull();
});

it('draws two cards behind a stacked thumb', () => {
	render(<PosterThumb picture={{ kind: 'tint', tint: 2 }} stacked />);
	expect(screen.getByTestId('poster-stack').children).toHaveLength(2);
});
