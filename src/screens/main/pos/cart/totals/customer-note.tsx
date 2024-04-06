import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
// import { EdittableText } from '@wcpos/components/src/edittable-text';
import Icon from '@wcpos/components/src/icon';
import Pressable from '@wcpos/components/src/pressable';
import Text from '@wcpos/components/src/text';
import TextArea from '@wcpos/components/src/textarea';
import Tooltip from '@wcpos/components/src/tooltip';

import { useT } from '../../../../../contexts/translations';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const CustomerNote = () => {
	const [isEditing, setIsEditing] = React.useState(false);
	const { currentOrder } = useCurrentOrder();
	const note = useObservableEagerState(currentOrder.customer_note$);
	const [value, setValue] = React.useState(note);
	const theme = useTheme();
	const t = useT();

	// /**
	//  * Keep textarea value insync with the order.customer_note
	//  */
	React.useEffect(() => {
		setValue(note);
	}, [note]);

	/**
	 *
	 */
	const handleSaveNote = React.useCallback(() => {
		const order = currentOrder.getLatest();
		order.patch({ customer_note: value.replace(/^\s+|\s+$/g, '').trim() });
		setIsEditing(false);
	}, [currentOrder, value]);

	/**
	 *
	 */
	if (isEmpty(value)) {
		return null;
	}

	/**
	 *
	 */
	return (
		<Box
			padding="small"
			space="small"
			border
			style={{
				borderLeftWidth: 0,
				borderRightWidth: 0,
				borderColor: theme.colors.lightGrey,
				backgroundColor: theme.colors.lightestGrey,
			}}
		>
			<Box horizontal space="small">
				<Box paddingTop="xxSmall">
					<Tooltip content={t('Customer Note', { _tags: 'core' })}>
						<Icon name="noteSticky" type="secondary" />
					</Tooltip>
				</Box>

				<Box fill>
					{isEditing ? (
						<TextArea
							value={value}
							onChangeText={setValue}
							onBlur={handleSaveNote}
							autoFocus
							onReturnKeyPress={handleSaveNote}
						/>
					) : (
						<Pressable onPress={() => setIsEditing(true)}>
							<Text style={{ lineHeight: theme.font.lineHeight.large }}>{value}</Text>
						</Pressable>
					)}
				</Box>
			</Box>
		</Box>
	);
};
