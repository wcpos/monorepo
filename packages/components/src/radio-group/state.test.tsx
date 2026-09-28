import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { RadioGroup, RadioGroupItem } from './index';

jest.mock('@rn-primitives/radio-group', () => ({
	Root: ({ children }: React.PropsWithChildren) => <>{children}</>,
	Item: ({
		children,
		className,
		value,
	}: {
		children: React.ReactNode;
		className: string;
		value: string;
	}) => (
		<div data-testid={value} className={className}>
			{children}
		</div>
	),
	Indicator: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../label', () => ({ Label: () => null }));
it('reads the selected value from the group for the item border', () => {
	const tree = (value: string) => (
		<RadioGroup value={value}>
			<RadioGroupItem value="first" />
			<RadioGroupItem value="second" />
		</RadioGroup>
	);
	const { rerender } = render(tree('first'));
	expect(screen.getByTestId('first')).toHaveClass('border-primary');
	expect(screen.getByTestId('second')).toHaveClass('border-border');
	rerender(tree('second'));
	expect(screen.getByTestId('second')).toHaveClass('border-primary');
	expect(screen.getByTestId('first')).not.toHaveClass('border-primary');
});
