import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Popover from '@wcpos/common/src/components/popover';
import Checkbox from '@wcpos/common/src/components/checkbox';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';

interface Props {
	columns: any;
	resetUI?: () => void;
	ui: any;
}

/**
 *
 */
const Actions: React.FC<Props> = ({ ui, columns }) => {
	const { t } = useTranslation();
	const [visible, setVisible] = React.useState(false);

	return (
		<Popover
			hideBackdrop
			open={visible}
			onRequestClose={() => setVisible(false)}
			activator={<Button title="Table Settings" onPress={() => setVisible(true)} />}
		>
			<Text>Columns</Text>
			{columns.map((column: any, index: number) => (
				<Checkbox
					key={column.key}
					label={t(`orders.column.label.${column.key}`)}
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

export default Actions;
