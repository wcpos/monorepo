import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/src/button';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import { cn } from '@wcpos/components/src/lib/utils';
import { Suspense } from '@wcpos/components/src/suspense';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

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
		<VStack className="h-full gap-0">
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
			<HStack className="bg-white border-border border-t gap-0">
				<Button variant="ghost" onPress={() => setActiveTab('products')} className="flex-1 h-11">
					<Icon
						name="gifts"
						className={activeTab === 'products' ? 'text-primary' : 'text-muted-foreground'}
					/>
					<Text
						className={cn(
							'text-xs uppercase',
							activeTab === 'products' ? 'text-primary' : 'text-muted-foreground'
						)}
					>
						{t('Products', { _tags: 'core' })}
					</Text>
				</Button>
				<Button variant="ghost" onPress={() => setActiveTab('cart')} className="flex-1 h-11">
					<Icon
						name="cartShopping"
						className={activeTab === 'cart' ? 'text-primary' : 'text-muted-foreground'}
					/>
					<Text
						className={cn(
							'text-xs uppercase',
							activeTab === 'cart' ? 'text-primary' : 'text-muted-foreground'
						)}
					>
						{t('Cart', { _tags: 'core' })}
					</Text>
				</Button>
			</HStack>
		</VStack>
	);
};

export default POSTabs;
