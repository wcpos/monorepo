import { DisplayOptions as SharedDisplayOptions } from '../components/display-options';
import { useT } from '../../../contexts/translations';

export function DisplayOptions() {
	const t = useT();
	return <SharedDisplayOptions id="coupons" title={t('coupons.coupon_settings')} />;
}
