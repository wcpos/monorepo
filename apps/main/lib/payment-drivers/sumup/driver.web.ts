import type { PaymentDriver } from '@wcpos/core/services/payment-drivers/types';

import type { Options } from './driver';

export function createSumUpDriver(_options: Options): PaymentDriver {
	const unavailable = async (): Promise<never> => {
		throw new Error('SumUp reader is unavailable on web');
	};
	return {
		provider: 'sumup',
		capabilities: { discovery: 'sdk_ui', cancel: 'on_device', refund: false },
		availability: () => ({ available: false, reason: 'web' }),
		openReaderSettings: unavailable,
		collect: unavailable,
		status$: {
			get: () => ({ connection: 'disconnected', reader: null }),
			subscribe: () => () => {},
		},
	};
}
