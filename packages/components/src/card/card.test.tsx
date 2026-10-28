import * as React from 'react';

import { render } from '@testing-library/react';

import { Card, CardContent } from './index';

jest.mock('react-native', () => ({
	View: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Text: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: () => null }));

it('is flat with an inset body', () => {
	const { container } = render(
		<Card>
			<CardContent />
		</Card>
	);
	const card = container.firstElementChild!;
	expect(card.className).not.toContain('shadow');
	expect(card.children[0]).toHaveClass('p-4', 'pt-0');
});

it('lets caller padding override the new default', () => {
	const { container } = render(<CardContent className="p-0" />);
	expect(container.firstChild).toHaveClass('p-0');
	expect(container.firstChild).not.toHaveClass('p-4');
});
