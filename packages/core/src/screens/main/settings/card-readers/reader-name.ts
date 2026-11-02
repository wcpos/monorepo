import type { ReaderInfo } from '../../../../services/payment-drivers/types';

// Stripe reports the SDK's device type; the cashier knows the name on the box. Its own module so
// the pay sheet's reader line shows the same name without loading the Settings row.
const MODEL_NAMES: Record<string, string> = {
	wisePad3: 'WisePad 3',
	stripeM2: 'Stripe Reader M2',
	chipper2X: 'Chipper 2X',
	wisePosE: 'WisePOS E',
	stripeS700: 'Stripe Reader S700',
};

export function readerName(
	reader: (Pick<ReaderInfo, 'label' | 'model'> & Partial<Pick<ReaderInfo, 'transport'>>) | null,
	t: (key: string) => string
): string {
	if (!reader) return '';
	if (reader.transport === 'tap_to_pay') return t('settings.card_readers.this_device');
	const model = reader.model ? (MODEL_NAMES[reader.model] ?? reader.model) : null;
	return model ?? reader.label;
}
