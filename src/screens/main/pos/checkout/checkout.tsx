import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';
import get from 'lodash/get';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Loader from '@wcpos/components/src/loader';
import useSnackbar from '@wcpos/components/src/snackbar';
import Tabs from '@wcpos/components/src/tabs';
import Text from '@wcpos/components/src/text';
import WebView from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

import useGateways from '../../../../contexts/gateways';
import useOrders from '../../../../contexts/orders';
import useCurrencyFormat from '../../../../hooks/use-currency-format';

// import { POSContext } from '../pos';

// interface CheckoutProps {
// 	order: import('@wcpos/database').OrderDocument;
// }

export const CheckoutTabs = React.forwardRef((props, ref) => {
	const [index, setIndex] = React.useState(0);
	const [loading, setLoading] = React.useState(true);
	const { format } = useCurrencyFormat();
	const iframeRef = React.useRef<HTMLIFrameElement>();
	const { data: gateways } = useGateways();
	const { data } = useOrders();
	const order = data?.[0]; // @TODO - findOne option
	const paymentUrl = order.getPaymentURL();
	const navigation = useNavigation();
	const addSnackbar = useSnackbar();

	// React.useEffect(() => {
	// 	if (order.status !== 'pos-open') {
	// 		debugger;
	// 	}
	// }, [order]);

	/**
	 *
	 */
	const routes = React.useMemo(() => {
		return gateways.map((gateway) => {
			return {
				key: gateway.id,
				title: gateway.title,
			};
		});
	}, [gateways]);

	/**
	 *
	 */
	const handlePaymentReceived = React.useCallback(
		(event: MessageEvent) => {
			if (event?.data?.action === 'wcpos-payment-received') {
				order.atomicPatch(event?.data?.payload);
				navigation.dispatch(
					StackActions.replace('Receipt', {
						_id: order._id,
					})
				);
			}
		},
		[navigation, order]
	);
	// React.useEffect(() => {
	// 	const handlePaymentReceived = (event: MessageEvent) => {
	// 		if (event?.data?.action === 'wcpos-payment-received') {
	// 			order.atomicPatch(event?.data?.payload);
	// 			navigation.dispatch(
	// 				StackActions.replace('Receipt', {
	// 					_id: order._id,
	// 				})
	// 			);
	// 		}
	// 	};

	// 	window.addEventListener('message', handlePaymentReceived);

	// 	return () => {
	// 		window.removeEventListener('message', handlePaymentReceived);
	// 	};
	// }, [navigation, order]);

	/**
	 *
	 */
	const renderScene = React.useCallback(
		({ route }) => {
			if (!route) {
				return <Text>No route</Text>;
			}

			return (
				<View style={{ position: 'relative', height: '100%', paddingLeft: 10 }}>
					{loading ? (
						<View
							style={[
								StyleSheet.absoluteFill,
								{
									position: 'absolute',
									backgroundColor: '#FFF',
									alignItems: 'center',
									justifyContent: 'center',
								},
							]}
						>
							<Loader size="large" type="secondary" />
						</View>
					) : null}
					<ErrorBoundary>
						<WebView
							ref={iframeRef}
							src={`${paymentUrl}&wcpos=1&gateway=${route.key}`}
							onLoad={() => {
								setLoading(false);
							}}
							onMessage={(event) => {
								if (event?.data?.payload?.data) {
									addSnackbar({ message: event?.data?.payload?.message });
								} else {
									handlePaymentReceived(event);
								}
							}}
							style={{ height: '100%' }}
						/>
					</ErrorBoundary>
				</View>
			);
		},
		[addSnackbar, handlePaymentReceived, loading, paymentUrl]
	);

	/**
	 *
	 */
	// const handleProcessPayment = React.useCallback(() => {
	// 	if (iframeRef.current && iframeRef.current.contentWindow) {
	// 		setLoading(true);
	// 		iframeRef.current.contentWindow.postMessage({ action: 'wcpos-process-payment' }, '*');
	// 	}
	// }, []);

	/**
	 *
	 */
	React.useImperativeHandle(
		ref,
		() => {
			return {
				processPayment() {
					if (iframeRef.current && iframeRef.current.contentWindow) {
						setLoading(true);
						iframeRef.current.contentWindow.postMessage({ action: 'wcpos-process-payment' }, '*');
					} else {
						setLoading(true);
						iframeRef.current.postMessage({ action: 'wcpos-process-payment' }, '*');
					}
				},
			};
		},
		[]
	);

	/**
	 *
	 */
	if (!order) {
		return <Text>Order not found</Text>;
	}

	/**
	 *
	 */
	if (gateways.length === 0) {
		return <Text>No gateways found</Text>;
	}

	/**
	 *
	 */
	return (
		<Box space="medium">
			<Text size="large" align="center" weight="bold">
				{`Amount to Pay: ${format(order.total || 0)}`}
			</Text>
			<Tabs
				onIndexChange={(idx) => {
					setLoading(true);
					setIndex(idx);
				}}
				navigationState={{ index, routes }}
				renderScene={renderScene}
				tabBarPosition="left"
				style={{ minHeight: 400 }}
			/>
		</Box>
	);
});
