import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Switch } from './index';

jest.mock('react-native-reanimated', () => ({ Easing: { bezier: () => () => 0 } }));
jest.mock('uniwind', () => ({ useCSSVariable: jest.fn() }));
jest.mock('../label', () => ({ Label: () => null }));
jest.mock('@rn-primitives/switch', () => ({
	Root: ({ children, className }: { children: React.ReactNode; className: string }) => (
		<div data-testid="track" className={className}>
			{children}
		</div>
	),
	Thumb: ({ className }: { className: string }) => (
		<div data-testid="thumb" className={className} />
	),
}));
it('uses the drawn web track and thumb geometry', () => {
	const { rerender } = render(<Switch onCheckedChange={() => {}} checked={false} />);
	expect(screen.getByTestId('track')).toHaveClass('h-5', 'w-8.5', 'bg-border');
	expect(screen.getByTestId('thumb')).toHaveClass('size-4', 'bg-card', 'translate-x-0');
	rerender(<Switch onCheckedChange={() => {}} checked />);
	expect(screen.getByTestId('thumb')).toHaveClass('translate-x-3.5');
});
