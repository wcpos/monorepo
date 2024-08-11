import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/tailwind/src/button';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import Cart from './cart';
import Products from './products';
import { useT } from '../../../contexts/translations';

/**
 *
 */
const POSTabs = () => {
	const [activeTab, setActiveTab] = React.useState('products');
	const t = useT();

	return (
		<VStack>
			<View className="flex-1">
				{activeTab === 'products' ? (
					<Suspense>
						<ErrorBoundary>
							<Products />
						</ErrorBoundary>
					</Suspense>
				) : (
					<Suspense>
						<ErrorBoundary>
							<Cart />
						</ErrorBoundary>
					</Suspense>
				)}
			</View>
			<HStack className="bg-white border-t">
				<Button variant="ghost" onPress={() => setActiveTab('products')}>
					<Icon
						name="gifts"
						//  type={activeTab === 'products' ? 'primary' : 'text'}
					/>
					<Text
						className="text-xs uppercase"
						//type={activeTab === 'products' ? 'primary' : 'text'}
					>
						{t('Products', { _tags: 'core' })}
					</Text>
				</Button>
				<Button variant="ghost" onPress={() => setActiveTab('cart')}>
					<Icon
						name="cartShopping"
						// type={activeTab === 'cart' ? 'primary' : 'text'}
					/>
					<Text
						className="text-xs uppercase"
						size="xSmall"
						// type={activeTab === 'cart' ? 'primary' : 'text'}
					>
						{t('Cart', { _tags: 'core' })}
					</Text>
				</Button>
			</HStack>
		</VStack>
	);
};

export default POSTabs;
