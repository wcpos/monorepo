import { HStack } from '../hstack';
import { Icon } from './index';

export const stories = [
	{ id: 'default', render: () => <Icon name="cartShopping" /> },
	{
		id: 'sizes',
		render: () => (
			<HStack>
				{(['xs', 'sm', 'default', 'lg', 'xl', '2xl', '3xl', '4xl'] as const).map((size) => (
					<Icon key={size} name="cartShopping" size={size} />
				))}
			</HStack>
		),
	},
	{
		id: 'variants',
		render: () => (
			<HStack>
				{(['default', 'primary', 'destructive', 'muted', 'success', 'warning'] as const).map(
					(variant) => (
						<Icon key={variant} name="cartShopping" variant={variant} />
					)
				)}
			</HStack>
		),
	},
	{ id: 'loading', render: () => <Icon name="cartShopping" loading /> },
];
