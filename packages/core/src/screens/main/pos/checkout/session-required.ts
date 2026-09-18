import type { CategoryLogger, LoggerOptions } from '@wcpos/utils/logger';

import type { useT } from '../../../../contexts/translations';

export function presentSessionRequired(
	logger: CategoryLogger,
	t: ReturnType<typeof useT>,
	context?: LoggerOptions['context']
) {
	logger.info(t('pos_checkout.open_register_first'), { showToast: true, context });
}
