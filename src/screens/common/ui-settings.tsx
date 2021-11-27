import * as React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';
import set from 'lodash/set';
import Popover from '@wcpos/common/src/components/popover4';
import Icon from '@wcpos/common/src/components/icon';
import Checkbox from '@wcpos/common/src/components/checkbox';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';

interface UiSettingsProps {
	ui: import('@wcpos/common/src/hooks/use-ui').UIDocument;
}

const UiSettings = ({ ui }: UiSettingsProps) => {
	const { t } = useTranslation();
	const key = ui.id.split('_')[1];
	// const columns = useObservableState(ui.get$('columns'), ui.get('columns'));
	const { columns } = useObservableState(ui.$, ui.toJSON());

	const settings = (
		<>
			<Text>Columns</Text>
			{columns.map((column: any, index: number) => {
				return (
					<View key={column.key}>
						<Checkbox
							label={t(`${key}.column.label.${column.key}`)}
							checked={!column.hide}
							onChange={(checked) => {
								set(columns, `${index}.hide`, !checked);
								ui.atomicPatch({ columns });
							}}
						/>
						{column.display
							? column.display.map((display: any, i: number) => (
									// eslint-disable-next-line react/jsx-indent
									<Checkbox
										key={display.key}
										label={t(`${key}.column.label.${display.key}`)}
										checked={!display.hide}
										onChange={(checked) => {
											column.display[i] = { ...display, hide: !checked };
											ui.atomicPatch({ columns });
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
		<Popover content={settings}>
			<Icon name="cog" />
		</Popover>
	);
};

export default UiSettings;
