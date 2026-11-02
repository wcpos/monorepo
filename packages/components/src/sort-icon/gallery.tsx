import { SortIcon } from './index';

export const stories = [
	{ id: 'none', render: () => <SortIcon /> },
	{ id: 'hovered', render: () => <SortIcon hovered /> },
	{ id: 'asc', render: () => <SortIcon direction="asc" /> },
	{ id: 'desc', render: () => <SortIcon direction="desc" /> },
];
