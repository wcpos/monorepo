import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { Checkbox } from './index';

jest.mock('@rn-primitives/checkbox', () => ({
	Root: ({ children, className }: { children: React.ReactNode; className: string }) => (
		<div data-testid="checkbox" className={className}>
			{children}
		</div>
	),
	Indicator: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('../icon', () => ({ Icon: ({ name }: { name: string }) => <span data-testid={name} /> }));
it('paints both checked and indeterminate on the same size on both platforms', () => {
	const { rerender } = render(<Checkbox onCheckedChange={() => {}} checked={false} />);
	expect(screen.getByTestId('checkbox')).toHaveClass('size-5', 'bg-card');
	expect(screen.getByTestId('checkbox')).not.toHaveClass('border-primary');
	rerender(<Checkbox onCheckedChange={() => {}} checked />);
	expect(screen.getByTestId('checkbox')).toHaveClass('bg-primary', 'border-primary');
	rerender(<Checkbox onCheckedChange={() => {}} checked={false} indeterminate />);
	expect(screen.getByTestId('checkbox')).toHaveClass('bg-primary', 'border-primary');
	expect(screen.getByTestId('minus')).toBeInTheDocument();
});
