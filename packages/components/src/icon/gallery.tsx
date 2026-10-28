import { HStack } from '../hstack';
import { Icon } from './index';

export const stories = [
	{ id: 'default', render: () => <Icon name="cart" /> },
	{
		id: 'sizes',
		render: () => (
			<HStack>
				{(['xs', 'sm', 'default', 'lg', 'xl', '2xl', '3xl', '4xl'] as const).map((size) => (
					<Icon key={size} name="cart" size={size} />
				))}
			</HStack>
		),
	},
	{
		id: 'variants',
		render: () => (
			<HStack>
				{(['default', 'primary', 'bad', 'muted', 'ok', 'warning'] as const).map((variant) => (
					<Icon key={variant} name="cart" variant={variant} />
				))}
			</HStack>
		),
	},
	{ id: 'loading', render: () => <Icon name="cart" loading /> },
];
