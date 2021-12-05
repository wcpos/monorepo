import * as React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useObservableState, useSubscription } from 'observable-hooks';
import { map } from 'rxjs/operators';
import set from 'lodash/set';
import Popover from '@wcpos/common/src/components/popover';
import Icon from '@wcpos/common/src/components/icon';
import Checkbox from '@wcpos/common/src/components/checkbox';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';

interface UiSettingsProps {
	ui: import('@wcpos/common/src/hooks/use-ui-resource').UIDocument;
}

const UiSettings = ({ ui }: UiSettingsProps) => {
	const { t } = useTranslation();
	const columns = useObservableState(ui.get$('columns'), ui.get('columns'));

	const settings = (
		<>
			<Text>Columns</Text>
			{columns.map((column: any, columnIndex: number) => {
				return (
					<View key={column.key}>
						<Checkbox
							label={t(`${ui.getID()}.column.label.${column.key}`)}
							checked={!column.hide}
							onChange={(checked) => {
								set(columns, `${columnIndex}.hide`, !checked);
								ui.atomicPatch({ columns: [...columns] });
							}}
						/>
						{column.display
							? column.display.map((display: any, displayIndex: number) => (
									// eslint-disable-next-line react/jsx-indent
									<Checkbox
										key={display.key}
										label={t(`${ui.getID()}.column.label.${display.key}`)}
										checked={!display.hide}
										onChange={(checked) => {
											set(column, `display.${displayIndex}.hide`, !checked);
											ui.atomicPatch({ columns: [...columns] });
										}}
										style={{ marginLeft: 10 }}
									/>
							  ))
							: null}
					</View>
				);
			})}
			<Button title="Restore Default Settings" onPress={ui.reset} />
		</>
	);

	return (
		<Popover content={settings} placement="bottom-end">
			<Icon name="sliders" />
		</Popover>
	);
};

export default UiSettings;
