import * as React from 'react';
import { TextInput } from 'react-native';

import Box from '@wcpos/components/src/box';
import Checkbox from '@wcpos/components/src/checkbox';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';

import { t } from '../../../../lib/translations';
import useCurrentOrder from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface AddFeeProps {
	order: OrderDocument;
}

const AddFee = ({ order }: AddFeeProps) => {
	const [opened, setOpened] = React.useState(false);
	const feeNameRef = React.useRef<TextInput>(null);
	const feeTotalRef = React.useRef<TextInput>(null);
	const { addFee } = useCurrentOrder();

	const handleAddFee = React.useCallback(() => {
		const name = feeNameRef.current?.value;
		const total = feeTotalRef.current?.value;
		addFee({
			name,
			total,
		});
		setOpened(false);
	}, [addFee]);

	return (
		<>
			<Box horizontal space="small" padding="small" align="center">
				<Box fill>
					<Text>{t('Add Fee', { _tags: 'core' })}</Text>
				</Box>
				<Box>
					<Icon name="circlePlus" onPress={() => setOpened(true)} />
				</Box>
			</Box>
			<Modal
				opened={opened}
				onClose={() => setOpened(false)}
				title={t('Add Fee', { _tags: 'core' })}
				primaryAction={{
					label: t('Add to Cart', { _tags: 'core' }),
					action: handleAddFee,
				}}
				secondaryActions={[
					{ label: t('Cancel', { _tags: 'core' }), action: () => setOpened(false) },
				]}
			>
				<Box space="small">
					<TextInputWithLabel ref={feeNameRef} label={t('Fee Name', { _tags: 'core' })} />
					<TextInputWithLabel
						ref={feeTotalRef}
						label={t('Amount', { _tags: 'core' })}
						prefix={order.currency_symbol}
					/>
					{/* <Checkbox value={true} label={t('Taxable')} /> */}
				</Box>
			</Modal>
		</>
	);
};

export default AddFee;
