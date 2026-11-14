import { Toast } from '@wcpos/components/toast';

import type { useRouter } from 'expo-router';
import type { useT } from '../../../../contexts/translations';
import type { CheckoutRejection } from './hooks/use-checkout-save';

export function showOrderRefusedToast({
	t,
	router,
	rejection,
}: {
	t: ReturnType<typeof useT>;
	router: Pick<ReturnType<typeof useRouter>, 'push'>;
	rejection: CheckoutRejection;
}) {
	Toast.show({
		type: 'error',
		title: t('pos_checkout.order_refused'),
		description: rejection.message ?? rejection.reason ?? t('pos_checkout.order_refused_no_reason'),
		action: {
			label: t('pos_checkout.open_store_health'),
			onClick: () => router.push('/health/database'),
		},
	});
}
