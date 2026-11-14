import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { TONE } from '../lib/tone';
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

	it.each(Object.keys(TONE) as (keyof typeof TONE)[])(
		"paints the tone map's %s dot, not the word",
		(tone) => {
			render(<StatusBadge testID="badge" label="Signed in" variant={tone} />);

			expect(dotOf('badge')).toHaveClass('size-2', 'rounded-full', TONE[tone].dot);
			expect(wordOf('badge')).toHaveTextContent('Signed in');
			expect(wordOf('badge')).toHaveClass('text-foreground', 'text-sm');
			expect(wordOf('badge')?.getAttribute('class')).not.toContain(TONE[tone].dot);
		}
	);

	it('defaults to the primary dot', () => {
		render(<StatusBadge testID="badge" label="Default" />);
		expect(dotOf('badge')).toHaveClass('bg-primary');
	});

	it('hides the dot from assistive tech: the word is the status', () => {
		render(<StatusBadge testID="badge" label="Signed in" variant="ok" />);
		expect(dotOf('badge')).toHaveAttribute('aria-hidden');
	});

	it('merges a caller className onto the row', () => {
		render(<StatusBadge testID="badge" label="In stock" variant="ok" className="self-start" />);
		expect(screen.getByTestId('badge')).toHaveClass('flex-row', 'items-center', 'self-start');
	});

	it('is a dot and a word in source: no pill, no tint, no arbitrary text size', () => {
		const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
		expect(source).not.toContain('text-[');
		expect(source).not.toContain('/15');
		expect(source).not.toMatch(/rounded-full px-/);
	});
});

it('has a caption size for a row state line or a log level: the small dot and the help rank', () => {
	render(<StatusBadge testID="badge" size="caption" label="Not in range" variant="muted" />);
	const dot = screen.getByTestId('badge').querySelector('div');
	expect(dot).toHaveClass('size-1.5', TONE.muted.dot);
	expect(dot).not.toHaveClass('size-2');
	expect(screen.getByTestId('badge').querySelector('span')).toHaveClass(
		'text-muted-foreground',
		'text-xs'
	);
});
