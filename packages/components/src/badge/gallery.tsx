import { Badge } from './index';

export const stories = [
	{ id: 'count', render: () => <Badge count={5} /> },
	{ id: 'max', render: () => <Badge count={150} max={99} /> },
	{ id: 'dot', render: () => <Badge dot /> },
	{ id: 'sm', render: () => <Badge count={3} size="sm" variant="destructive" /> },
	{
		id: 'lg',
		render: () => (
			<Badge size="lg" variant="muted">
				Unsynced
			</Badge>
		),
	},
	{ id: 'secondary', render: () => <Badge count={12} variant="secondary" /> },
];
