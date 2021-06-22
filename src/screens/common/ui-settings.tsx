import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Popover from '@wcpos/common/src/components/popover';
import Icon from '@wcpos/common/src/components/icon';
import Checkbox from '@wcpos/common/src/components/checkbox';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';

interface UiSettingsProps {
	ui: any;
}

const UiSettings = ({ ui }: UiSettingsProps) => {
	const { t } = useTranslation();
	const columns = ui.get('columns');
	const [visible, setVisible] = React.useState(false);

	return (
		<Popover
			open={visible}
			activator={<Icon name="cog" onPress={() => setVisible(true)} />}
			onRequestClose={() => setVisible(false)}
		>
			<Text>Columns</Text>
			{columns.map((column: any, index: number) => (
				<Checkbox
					key={column.key}
					name={column.key}
					label={t(`customers.column.label.${column.key}`)}
					checked={!column.hide}
					onChange={(checked) => {
						columns[index] = { ...column, hide: !checked };
						ui.atomicSet('columns', columns);
					}}
				/>
			))}
			{/* <Text>Display</Text>
			{display.map((d: any) => (
				<Checkbox
					key={d.key}
					name={d.key}
					label={d.label}
					checked={!d.hide}
					onChange={(checked) => {
						d.updateWithJson({ hide: !checked });
					}}
				/>
			))} */}
			<Button title="Restore Default Settings" onPress={ui.reset} />
		</Popover>
	);
};

export default UiSettings;
