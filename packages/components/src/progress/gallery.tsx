import { Progress } from './index';

export const stories = [
	{ id: 'value', render: () => <Progress value={60} /> },
	{ id: 'empty', render: () => <Progress value={0} /> },
	{ id: 'full', render: () => <Progress value={100} /> },
	{ id: 'indeterminate', render: () => <Progress indeterminate /> },
];
