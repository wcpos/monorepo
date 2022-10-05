import * as React from 'react';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Cart from './cart';
import Tabs from './tabs';

const OpenOrders = ({ isColumn = false }) => {
	/**
	 *
	 */
	return (
		<Box padding="small" paddingLeft={isColumn ? 'none' : 'small'} style={{ height: '100%' }}>
			<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
				<ErrorBoundary>
					<React.Suspense fallback={<Text>Loading Cart</Text>}>
						<Cart />
					</React.Suspense>
				</ErrorBoundary>
			</Box>
			<ErrorBoundary>
				<React.Suspense fallback={<Text>Loading Cart Tabs</Text>}>
					<Tabs />
				</React.Suspense>
			</ErrorBoundary>
		</Box>
	);
};

export default OpenOrders;
