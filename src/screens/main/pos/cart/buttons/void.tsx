import * as React from 'react';
import Button from '@wcpos/components/src/button';
import useSnackbar from '@wcpos/components/src/snackbar';
import { t } from '@wcpos/core/src/lib/translations';
import useCurrentOrder from '../../contexts/current-order';

interface VoidButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

let voidedOrderJSON = null;

const VoidButton = ({ order }: VoidButtonProps) => {
	const { setCurrentOrder } = useCurrentOrder();
	const addSnackbar = useSnackbar();

	/**
	 * @TODO - upsert children, should be done during preInsert hook
	 */
	const undoRemove = React.useCallback(async () => {
		const success = await order.collection.insert(voidedOrderJSON).catch(() => {
			debugger;
		});

		if (success) {
			setCurrentOrder(success);
		}
	}, [order.collection, setCurrentOrder]);

	/**
	 *
	 */
	const handleRemove = React.useCallback(async () => {
		voidedOrderJSON = await order.toRestApiJSON();
		await order.remove();
		setCurrentOrder(null);
		addSnackbar({
			message: t('Order removed'),
			dismissable: true,
			action: { label: t('Undo'), action: undoRemove },
		});
	}, [addSnackbar, order, setCurrentOrder, undoRemove]);

	/**
	 *
	 */
	return (
		<Button
			fill
			size="large"
			title={t('Void')}
			onPress={handleRemove}
			type="critical"
			style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
		/>
	);
};

export default VoidButton;
