import { StatusBadge } from './index';

export const stories = [
	{ id: 'ok', render: () => <StatusBadge label="Signed in" variant="ok" /> },
	{ id: 'warning', render: () => <StatusBadge label="Sign in again" variant="warning" /> },
	{ id: 'bad', render: () => <StatusBadge label="Out of stock" variant="bad" /> },
	{ id: 'info', render: () => <StatusBadge label="3 users" variant="info" /> },
	{ id: 'muted', render: () => <StatusBadge label="Settles later" variant="muted" /> },
	{ id: 'default', render: () => <StatusBadge label="Default" /> },
];
