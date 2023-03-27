import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { Observable } from 'rxjs';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Loader from '@wcpos/components/src/loader';

import { t } from '../../../lib/translations';

interface SyncButtonProps {
	sync: () => Promise<null>;
	clear: () => Promise<null>;
	active$: Observable<boolean>;
}

const SyncButton = ({ sync, clear, active$ }: SyncButtonProps) => {
	const [openMenu, setOpenMenu] = React.useState(false);
	const syncing = useObservableState(active$);

	/**
	 *
	 */
	const handleClearAndSync = React.useCallback(async () => {
		await clear();
		await sync();
	}, [clear, sync]);

	/**
	 *
	 */
	return syncing ? (
		<Loader size="small" />
	) : (
		<Dropdown
			opened={openMenu}
			onClose={() => setOpenMenu(false)}
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
					action: handleClearAndSync,
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
				onLongPress={() => setOpenMenu(true)}
				tooltip={t('Press to sync, long press for more options', { _tags: 'core' })}
				tooltipPlacement="top-end"
			/>
		</Dropdown>
	);
};

export default SyncButton;
