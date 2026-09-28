import { StatusBadge } from './index';

export const stories = [
	{ id: 'success', render: () => <StatusBadge label="Signed in" variant="success" /> },
	{ id: 'warning', render: () => <StatusBadge label="Sign in again" variant="warning" /> },
	{ id: 'error', render: () => <StatusBadge label="Out of stock" variant="error" /> },
	{ id: 'info', render: () => <StatusBadge label="3 users" variant="info" /> },
	{ id: 'muted', render: () => <StatusBadge label="Settles later" variant="muted" /> },
	{ id: 'default', render: () => <StatusBadge label="Default" /> },
];
