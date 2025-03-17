import { Text } from 'react-native';

import { useLocalSearchParams } from 'expo-router';

export default function CheckoutScreen() {
	const { orderId } = useLocalSearchParams<{ orderId: string }>();

	return <Text>Checkout {orderId}</Text>;
}
