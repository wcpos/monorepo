import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { StatusBadge } from './index';

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	View: ({ testID, ...props }: any) =>
		React.createElement('div', { ...props, 'data-testid': testID }),
	Text: ({ children, ...props }: any) => React.createElement('span', props, children),
	StyleSheet: { create: (styles: any) => styles },
}));

// Ships untransformed JSX; the real `Text` pulls it in for `asChild`, which nothing here uses.
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children }: any) => children,
}));

/**
 * Removal R3 (wcpos/roadmap#351): the badge is a dot plus a word. The dot carries the
 * semantic colour; the word keeps the foreground colour at a size the cashier can read
 * at arm's length. There is no pill and no shape prop.
 */
describe('status-badge dot + word', () => {
	function dotOf(testID: string) {
		return screen.getByTestId(testID).querySelector('div');
	}
	function wordOf(testID: string) {
		return screen.getByTestId(testID).querySelector('span');
	}

	it.each([
		['success', 'bg-success'],
		['warning', 'bg-warning'],
		['error', 'bg-destructive'],
		['info', 'bg-info'],
		['muted', 'bg-muted-foreground'],
	] as const)('paints the %s variant on the dot, not the word', (variant, dotClass) => {
		render(<StatusBadge testID="badge" label="Signed in" variant={variant} />);

		expect(dotOf('badge')).toHaveClass('size-2', 'rounded-full', dotClass);
		expect(wordOf('badge')).toHaveTextContent('Signed in');
		expect(wordOf('badge')).toHaveClass('text-foreground', 'text-sm');
		expect(wordOf('badge')?.getAttribute('class')).not.toMatch(
			/text-(success|warning|destructive|info|muted-foreground)/
		);
	});

	it('defaults to the primary dot', () => {
		render(<StatusBadge testID="badge" label="Default" />);
		expect(dotOf('badge')).toHaveClass('bg-primary');
	});

	it('hides the dot from assistive tech: the word is the status', () => {
		render(<StatusBadge testID="badge" label="Signed in" variant="success" />);
		expect(dotOf('badge')).toHaveAttribute('aria-hidden');
	});

	it('merges a caller className onto the row', () => {
		render(
			<StatusBadge testID="badge" label="In stock" variant="success" className="self-start" />
		);
		expect(screen.getByTestId('badge')).toHaveClass('flex-row', 'items-center', 'self-start');
	});

	it('is a dot and a word in source: no pill, no tint, no arbitrary text size', () => {
		const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
		expect(source).not.toContain('text-[');
		expect(source).not.toContain('/15');
		expect(source).not.toMatch(/rounded-full px-/);
	});
});
