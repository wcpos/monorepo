import { columnsOnlyFormSchema, UISettingsColumnsOnlyForm } from '../components/ui-settings';

export const schema = columnsOnlyFormSchema;

export function UISettingsForm() {
	return <UISettingsColumnsOnlyForm id="reports-orders" />;
}
