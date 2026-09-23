import * as React from 'react';

import { render } from '@testing-library/react';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './index';

jest.mock('react-native', () => ({
	View: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Text: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: () => null }));

it('keeps the shadow and rounded header while quieting the title and insets', () => {
	const { container } = render(
		<Card>
			<CardHeader>
				<CardTitle>Coffee Monster</CardTitle>
			</CardHeader>
			<CardContent />
			<CardFooter />
		</Card>
	);
	const card = container.firstElementChild!;
	expect(card).toHaveClass('shadow-md');
	expect(card.children[0]).toHaveClass('p-4', 'rounded-t-lg');
	expect(card.children[1]).toHaveClass('p-4', 'pt-0');
	expect(card.children[2]).toHaveClass('p-4', 'pt-0');
	expect(card.querySelector('span')).toHaveClass('text-lg');
	expect(card.querySelector('span')).not.toHaveClass('text-2xl');
});

it('lets caller padding override the new default', () => {
	const { container } = render(<CardContent className="p-0" />);
	expect(container.firstChild).toHaveClass('p-0');
	expect(container.firstChild).not.toHaveClass('p-4');
});
