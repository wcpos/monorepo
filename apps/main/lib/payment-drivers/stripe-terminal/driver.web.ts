import type { PaymentDriver } from '@wcpos/core/services/payment-drivers/types';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

const unavailable = async (): Promise<never> => {
	throw new Error('Stripe Terminal is unavailable on web');
};
export function createStripeTerminalDriver(_options: {
	resolveMethod: () => PaymentMethodDescriptor | null;
	bootstrap: (methodId: string) => Promise<Record<string, unknown>>;
}): PaymentDriver {
	return {
		provider: 'stripe',
		capabilities: { discovery: 'harness', cancel: 'app', refund: false },
		availability: () => ({ available: false, reason: 'web' }),
		discoverReaders: unavailable,
		connect: unavailable,
		collect: unavailable,
		disconnect: unavailable,
		cancel: unavailable,
		status$: {
			get: () => ({ connection: 'disconnected', reader: null }),
			subscribe: () => () => {},
		},
	};
}
