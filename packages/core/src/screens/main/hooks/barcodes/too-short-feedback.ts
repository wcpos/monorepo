import { Toast } from '@wcpos/components/toast';
import { getLogger } from '@wcpos/utils/logger';

const barcodeLogger = getLogger(['wcpos', 'barcode', 'detection']);

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Shared min-length rejection feedback for every scan source (wedge heuristic
 * and attributed wedge): scan feedback toasts directly, the logger only
 * records the event.
 */
export function showTooShortFeedback(t: Translate, barcode: string, minLength: number) {
	Toast.show({
		type: 'warning',
		title: t('common.barcode_scanned', { barcode }),
		description: t('common.barcode_must_be_at_least_characters', { minLength }),
		duration: 6000,
	});
	barcodeLogger.warn(t('common.barcode_scanned', { barcode }), {
		context: {
			barcode,
			minLength,
			actualLength: barcode.length,
		},
	});
}
