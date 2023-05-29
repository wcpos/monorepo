import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import SimpleTable from '@wcpos/components/src/simple-table';
import Text from '@wcpos/components/src/text';

import { t } from '../../../lib/translations';

export const KeyboardShortcuts = () => {
	const theme = useTheme();

	/**
	 *
	 */
	const keyComboRenderer = React.useCallback(
		({ item, column }) => (
			<Box
				border
				rounding="small"
				padding="xSmall"
				style={{ backgroundColor: theme.colors.lightGrey }}
			>
				<Text size="small" weight="bold" style={{ fontFamily: 'monospace' }}>
					{item[column.key]}
				</Text>
			</Box>
		),
		[theme]
	);

	/**
	 *
	 */
	return (
		<SimpleTable
			columns={[
				{
					key: 'key-combo',
					label: t('Key Combination', { _tags: 'core' }),
					cellRenderer: keyComboRenderer,
				},
				{ key: 'description', label: t('Description', { _tags: 'core' }) },
			]}
			data={[
				{
					'key-combo': 'ctrl + shift + s',
					description: t('Settings', { _tags: 'core' }),
				},
				{
					'key-combo': 'ctrl + shift + a',
					description: t('POS', { _tags: 'core' }),
				},
				{
					'key-combo': 'ctrl + shift + p',
					description: t('Products', { _tags: 'core' }),
				},
				{
					'key-combo': 'ctrl + shift + o',
					description: t('Orders', { _tags: 'core' }),
				},
				{
					'key-combo': 'ctrl + shift + c',
					description: t('Customers', { _tags: 'core' }),
				},
				{
					'key-combo': 'ctrl + shift + ?',
					description: t('Support', { _tags: 'core' }),
				},
				{
					'key-combo': 'ctrl + shift + l',
					description: t('Logout', { _tags: 'core' }),
				},
			]}
		/>
	);
};
