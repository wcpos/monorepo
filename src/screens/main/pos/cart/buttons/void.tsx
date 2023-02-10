import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Button from '@wcpos/components/src/button';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../../lib/translations';

interface VoidButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const VoidButton = ({ order }: VoidButtonProps) => {
	const addSnackbar = useSnackbar();
	const navigation = useNavigation();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (orderJson) => {
			try {
				await order.collection.insert(orderJson);
				navigation.setParams({ orderID: orderJson.uuid });
			} catch (err) {
				log.error(err);
			}
		},
		[navigation, order.collection]
	);

	/**
	 * @TODO - don't we just want to set the status to cancelled?
	 */
	const handleRemove = React.useCallback(async () => {
		const orderJson = await order.toPopulatedJSON();
		await order.remove();
		navigation.setParams({ orderID: '' });
		addSnackbar({
			message: t('Order removed', { _tags: 'core' }),
			dismissable: true,
			action: { label: t('Undo', { _tags: 'core' }), action: () => undoRemove(orderJson) },
		});
	}, [addSnackbar, navigation, order, undoRemove]);

	/**
	 *
	 */
	return (
		<Button
			fill
			size="large"
			title={t('Void', { _tags: 'core' })}
			onPress={handleRemove}
			type="critical"
			style={{
				flex: 1,
				borderTopLeftRadius: 0,
				borderTopRightRadius: 0,
				borderBottomRightRadius: 0,
			}}
		/>
	);
};

export default VoidButton;
