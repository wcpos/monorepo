import * as React from 'react';

import { Notice } from '@wcpos/components/notice';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';

import { useT } from '../../../../contexts/translations';

/**
 * The store refused this till's close (#2016): the count is kept. One line; the rest is in
 * Learn more (REGISTER211). Retry opens the count, so it is only offered where that is the way back.
 */
export function RefusedCloseNotice({
	onRetry,
	className,
}: {
	onRetry?: () => void;
	className?: string;
}) {
	const t = useT();
	return (
		<Notice
			tone="bad"
			testID="register-panel-refused-close"
			className={className}
			title={t('register.close_refused')}
			actions={
				onRetry
					? [{ label: t('register.retry'), testID: 'register-panel-retry-close', onPress: onRetry }]
					: undefined
			}
			docs={{ label: t('common.learn_more'), href: getErrorCodeDocURL('REGISTER211') }}
		/>
	);
}
