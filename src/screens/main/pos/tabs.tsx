import * as React from 'react';
import { View } from 'react-native';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import Cart from './cart';
import Products from './products';
import { t } from '../../../lib/translations';

const POSTabs = () => {
	const theme = useTheme();
	const [activeTab, setActiveTab] = React.useState('products');

	return (
		<View style={{ flex: 1 }}>
			<Box style={{ flex: 1 }}>{activeTab === 'products' ? <Products /> : <Cart />}</Box>
			<Box horizontal style={{ backgroundColor: '#FFFFFF', borderTopColor: theme.colors.border }}>
				<Button.Group background="clear" fill>
					<Button onPress={() => setActiveTab('products')}>
						<Box space="xxSmall" align="center">
							<Icon name="gifts" type={activeTab === 'products' ? 'primary' : 'text'} />
							<Text size="xSmall" type={activeTab === 'products' ? 'primary' : 'text'} uppercase>
								{t('Products', { _tags: 'core' })}
							</Text>
						</Box>
					</Button>
					<Button onPress={() => setActiveTab('cart')}>
						<Box space="xxSmall" align="center">
							<Icon name="cartShopping" type={activeTab === 'cart' ? 'primary' : 'text'} />
							<Text size="xSmall" type={activeTab === 'cart' ? 'primary' : 'text'} uppercase>
								{t('Cart', { _tags: 'core' })}
							</Text>
						</Box>
					</Button>
				</Button.Group>
			</Box>
		</View>
	);
};

export default POSTabs;
