import { HStack } from '../hstack';
import { Loader } from './index';

export const stories = [
	{ id: 'default', render: () => <Loader /> },
	{
		id: 'sizes',
		render: () => (
			<HStack>
				{(['xs', 'sm', 'default', 'lg', 'xl'] as const).map((size) => (
					<Loader key={size} size={size} />
				))}
			</HStack>
		),
	},
	{ id: 'muted', render: () => <Loader variant="muted" /> },
];
