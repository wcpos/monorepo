export interface PaymentGatewayContract {
	id: string;
	title?: string;
	provider?: string;
	pos_type?: string;
	enabled?: boolean;
	capabilities?: {
		supports_checkout?: boolean;
		supports_provider_refunds?: boolean;
		supports_automatic_refunds?: boolean;
		requires_hardware?: boolean;
	};
	provider_data?: Record<string, unknown>;
}

export type RefundDestination = 'original_method' | 'cash';

export function supportsCheckoutContract(gateway?: PaymentGatewayContract | null) {
	return gateway?.capabilities?.supports_checkout === true;
}

export function supportsOriginalMethodRefund(gateway?: PaymentGatewayContract | null) {
	return gateway?.capabilities?.supports_provider_refunds === true;
}

export function deriveRefundDestinationOptions(gateway?: PaymentGatewayContract | null) {
	return [
		{ value: 'original_method' as const, enabled: supportsOriginalMethodRefund(gateway) },
		{ value: 'cash' as const, enabled: true },
	];
}
