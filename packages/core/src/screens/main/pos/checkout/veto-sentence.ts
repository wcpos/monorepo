import type { useT } from '../../../../contexts/translations';

/** The store's veto sentence, or the till's own when the store gave none (contract T7). */
export function vetoSentence(
	veto: { message: string | null } | undefined | null,
	t: ReturnType<typeof useT>
): string | null {
	return veto ? (veto.message ?? t('pos_checkout.payment_vetoed')) : null;
}
