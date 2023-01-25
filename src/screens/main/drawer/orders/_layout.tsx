import * as React from 'react';

import { useNavigation, useRoute } from '@react-navigation/native';

import Modal from '@wcpos/components/src/modal';

import { OrdersProvider } from '../../../../contexts/orders';
import useModalRefreshFix from '../../../../hooks/use-modal-refresh-fix';

export const getModalLayout = (Component: JSX.Element, props) => {
	return React.memo(() => {
		useModalRefreshFix();
		const navigation = useNavigation();
		const route = useRoute();

		return (
			<OrdersProvider initialQuery={{ filter: { _id: route.params.orderID } }}>
				<Modal
					size="large"
					opened
					withPortal={false}
					onClose={() => navigation.goBack()}
					{...props}
				>
					<React.Suspense fallback={null}>
						<Component />
					</React.Suspense>
				</Modal>
			</OrdersProvider>
		);
	});
};
