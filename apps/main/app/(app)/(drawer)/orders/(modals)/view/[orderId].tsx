import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ViewOrderRedirect() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();
	return <Redirect href={{ pathname: '/orders', params: { order: orderId } }} />;
}
