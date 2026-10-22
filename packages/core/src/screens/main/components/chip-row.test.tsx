/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { ChipRow, ChipRowSkeleton } from './chip-row';

jest.mock('react-native', () => {
	const React = jest.requireActual('react');
	return {
		View: ({
			className,
			testID,
			children,
		}: React.PropsWithChildren<{ className?: string; testID?: string }>) => (
			<div data-testid={testID} data-class={className}>
				{children}
			</div>
		),
		// The scroller's handle: what a caller's ref gets (the POS bar scrolls a chip into view).
		ScrollView: ({
			ref,
			horizontal,
			showsHorizontalScrollIndicator,
			contentContainerClassName,
			children,
		}: React.PropsWithChildren<{
			ref?: React.Ref<{ scrollTo: () => void }>;
			horizontal?: boolean;
			showsHorizontalScrollIndicator?: boolean;
			contentContainerClassName?: string;
		}>) => {
			React.useImperativeHandle(ref, () => ({ scrollTo: () => {} }));
			return (
				<div
					data-testid="scroller"
					data-horizontal={String(horizontal)}
					data-indicator={String(showsHorizontalScrollIndicator)}
					data-content-class={contentContainerClassName}
				>
					{children}
				</div>
			);
		},
	};
});
jest.mock('@wcpos/components/skeleton', () => ({
	Skeleton: ({ shape }: { shape: string }) => (
		<span data-testid="chip-skeleton" data-shape={shape} />
	),
}));

// One chip row on every list surface: the page gutter all round, the pills in a scroller.
it('insets the pills by the page gutter in a horizontal scroller', () => {
	render(
		<ChipRow testID="chips">
			<button data-testid="pill" />
		</ChipRow>
	);
	const row = screen.getByTestId('chips');
	expect(row.getAttribute('data-class')).toBe('p-gutter');
	const scroller = screen.getByTestId('scroller');
	expect(row.contains(scroller)).toBe(true);
	expect(scroller.contains(screen.getByTestId('pill'))).toBe(true);
	expect(scroller.getAttribute('data-horizontal')).toBe('true');
	expect(scroller.getAttribute('data-indicator')).toBe('false');
	expect(scroller.getAttribute('data-content-class')).toBe('items-center gap-2');
});

it('hands its ref to the scroller', () => {
	const ref = React.createRef<{ scrollTo: () => void }>();
	render(
		<ChipRow ref={ref as never}>
			<button />
		</ChipRow>
	);
	expect(ref.current?.scrollTo).toEqual(expect.any(Function));
});

// The skeleton stands in the same row, so the card under it never moves when the pills arrive.
it('holds the row at the same gutter with chip-shaped placeholders', () => {
	render(<ChipRowSkeleton />);
	const row = screen.getByTestId('filter-bar-skeleton');
	expect(row.getAttribute('data-class')?.split(' ')).toContain('p-gutter');
	expect(screen.getAllByTestId('chip-skeleton')).toHaveLength(4);
	expect(
		screen.getAllByTestId('chip-skeleton').every((node) => node.dataset.shape === 'chip')
	).toBe(true);
});
