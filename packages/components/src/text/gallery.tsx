import { Text } from './index';

export const stories = [
	{
		id: 'default',
		render: () => (
			<Text>A canvas tote for everyday essentials, with sturdy handles and room to spare.</Text>
		),
	},
	{ id: 'link', render: () => <Text variant="link">How syncing works</Text> },
	{
		id: 'muted',
		render: () => <Text className="text-muted-foreground">Last synced just now</Text>,
	},
	{ id: 'small', render: () => <Text className="text-sm">Canvas tote</Text> },
];
