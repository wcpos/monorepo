import * as React from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { Button } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { UISettingsColumnsOnlyForm } from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';

export function DisplayOptions() {
	const t = useT();
	const { resetUI } = useUISettings('orders');
	const columns = React.useRef<ViewInstance>(null);
	const focusColumns = () => {
		if (Platform.OS === 'web')
			(columns.current as unknown as HTMLElement | null)
				?.querySelector<HTMLElement>('[role="switch"]')
				?.focus();
	};
	return (
		<Popover>
			<PopoverTrigger asChild>
				<IconButton
					name="sliders"
					testID="orders-bar-display"
					aria-label={t('orders.display_options')}
				/>
			</PopoverTrigger>
			<PopoverContent
				testID="orders-display-options"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					focusColumns();
				}}
				align="end"
				className="max-h-96 w-96 p-0"
			>
				{/* The title yields to Restore: a long translation truncates the title, never the action. */}
				<View className="border-border h-ctl flex-row items-center justify-between gap-2 border-b px-3">
					<Text className="min-w-0 shrink font-semibold" numberOfLines={1}>
						{t('orders.order_settings')}
					</Text>
					<Button
						variant="ghost"
						size="sm"
						className="shrink-0"
						testID="orders-display-restore"
						onPress={() => void resetUI()}
					>
						{t('orders.restore_defaults')}
					</Button>
				</View>
				<ScrollView>
					<View ref={columns}>
						<UISettingsColumnsOnlyForm id="orders" />
					</View>
				</ScrollView>
			</PopoverContent>
		</Popover>
	);
}
