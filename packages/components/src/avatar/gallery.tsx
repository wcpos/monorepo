import { HStack } from '../hstack';
import { Avatar } from './index';

export const stories = [
	{ id: 'initials', render: () => <Avatar fallback="PK" /> },
	{
		id: 'sizes',
		render: () => (
			<HStack>
				{(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
					<Avatar key={size} size={size} fallback="PK" />
				))}
			</HStack>
		),
	},
	{ id: 'rounded', render: () => <Avatar shape="rounded" fallback="CM" /> },
	{
		id: 'variants',
		render: () => (
			<HStack>
				{(['default', 'success', 'warning', 'error', 'muted'] as const).map((variant) => (
					<Avatar key={variant} variant={variant} fallback="PK" />
				))}
			</HStack>
		),
	},
];
