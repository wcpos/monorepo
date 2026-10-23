import * as React from 'react';

import { Notice } from '@wcpos/components/notice';

import { useT } from '../../../../../contexts/translations';

import type { PaymentFrameStatus } from './use-pay-frame-gate';

interface Props {
	status: PaymentFrameStatus | 'link-missing';
	onRetry?: () => void;
	/** The host's own notice id, which E2E selects by. */
	testID: string;
	className?: string;
}

/** Why the pay frame cannot take a payment; only `stalled` offers Retry (see PaymentFrameStatus). */
export function PayFrameNotice({ status, onRetry, testID, className }: Props) {
	const t = useT();
	if (status === 'loading' || status === 'ready') return null;
	return (
		<Notice
			tone="bad"
			className={className}
			title={
				status === 'link-missing'
					? t('pos_checkout.payment_form_unavailable')
					: status === 'stalled'
						? t('pos_checkout.payment_form_load_failed_retry')
						: t('pos_checkout.payment_form_navigation_failed')
			}
			actions={
				status === 'stalled' && onRetry
					? [{ label: t('common.retry'), onPress: onRetry, testID: 'checkout-payment-form-retry' }]
					: undefined
			}
			testID={testID}
		/>
	);
}
