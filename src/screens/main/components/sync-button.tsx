import * as React from 'react';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';

import { t } from '../../../lib/translations';

interface SyncButtonProps {
	sync: () => Promise<null>;
	clear: () => Promise<null>;
}

const SyncButton = ({ sync, clear }: SyncButtonProps) => {
	const [openMenu, setOpenMenu] = React.useState(false);

	return (
		<Dropdown
			opened={openMenu}
			onClose={() => {
				setOpenMenu(false);
			}}
			placement="top-end"
			items={[
				{
					label: t('Sync', { _tags: 'core' }),
					action: sync,
					icon: 'arrowRotateRight',
				},
				{ label: '__' },
				{
					label: t('Clear and Refresh', { _tags: 'core' }),
					action: () => {
						clear().then(sync);
					},
					type: 'critical',
					icon: 'trash',
				},
			]}
			trigger="longpress"
		>
			<Icon
				name="arrowRotateRight"
				size="small"
				onPress={sync}
				onLongPress={() => {
					setOpenMenu(true);
				}}
				tooltip={t('Press to sync, long press for more options', { _tags: 'core' })}
				tooltipPlacement="top-end"
			/>
		</Dropdown>
	);
};

export default SyncButton;
