import * as React from 'react';

import { render } from '@testing-library/react';

import { chunk, TileGrid } from './index';

it('chunks items into rows of the columns, the last row short', () => {
	expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	expect(chunk([1, 2], 4)).toEqual([[1, 2]]);
	expect(chunk([], 3)).toEqual([]);
});

it('columns in, equal cells out: every row has the columns, padded; a fragment is its tiles', () => {
	const { container } = render(
		<TileGrid columns={3}>
			{['a', 'b', 'c'].map((id) => (
				<span key={id} data-testid={id} />
			))}
			<>
				<span data-testid="d" />
			</>
			{null}
		</TileGrid>
	);
	const rows = Array.from(container.firstElementChild!.children);
	expect(rows.map((row) => row.children.length)).toEqual([3, 3]);
	expect(rows.map((row) => Array.from(row.children, (cell) => cell.children.length))).toEqual([
		[1, 1, 1],
		[1, 0, 0],
	]);
});
