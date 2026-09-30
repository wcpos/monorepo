import { DisplayOptions as SharedDisplayOptions } from '../components/display-options';
import { useT } from '../../../contexts/translations';

export function DisplayOptions() {
	const t = useT();
	return <SharedDisplayOptions id="customers" title={t('customers.customer_settings')} />;
}
