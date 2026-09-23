import { readFileSync } from 'node:fs';

import * as React from 'react';

import { render } from '@testing-library/react';

import { TextClassContext } from '../text';
import { PressableTableRow, TableCell, TableHead, TableRow } from './index';

jest.mock('react-native', () => ({
	View: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));
jest.mock('@rn-primitives/table', () => ({
	Row: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Head: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
	Cell: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'div' }));
jest.mock('./pulse-row', () => ({ PulseTableRow: () => null }));
jest.mock('uniwind', () => ({ useCSSVariable: () => ['white', 'gray'] }));
jest.mock('../text', () => ({ TextClassContext: React.createContext('') }));

function Label() {
	return <span className={React.useContext(TextClassContext)}>Item</span>;
}

it('renders hairline rows without stripes or inline background paint', () => {
	const { getAllByRole } = render(
		<>
			<TableRow index={1} />
			<PressableTableRow index={1} />
		</>
	);
	for (const row of getAllByRole('row')) {
		expect(row).toHaveClass('min-h-row', 'border-b', 'web:hover:bg-muted');
		expect(row.style.backgroundColor).toBe('');
		expect(row).not.toHaveClass('bg-muted/40');
	}
});

it('renders an unfilled uppercase head and padded column cell', () => {
	const { container } = render(
		<>
			<TableHead>
				<Label />
			</TableHead>
			<TableCell />
		</>
	);
	const [head, cell] = Array.from(container.children);
	expect(head).not.toHaveClass('bg-table-header');
	expect(head.firstElementChild).toHaveClass('uppercase', 'font-semibold');
	expect(cell).toHaveClass('flex-col', 'px-3', 'py-1.5');
});

it('retires the alternating row alias in both implementations', () => {
	for (const file of ['index.tsx', 'pulse-row.tsx']) {
		expect(readFileSync(`${__dirname}/${file}`, 'utf8')).not.toContain(
			['table-row', 'alt'].join('-')
		);
	}
});
