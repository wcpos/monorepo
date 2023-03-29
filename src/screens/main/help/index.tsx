import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { t } from '../../../lib/translations';

const Help = () => {
	const theme = useTheme();

	return (
		<Box space="normal">
			<Text size="medium" weight="medium">
				{t('Keyboard Shortcuts', { _tags: 'core' })}
			</Text>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + ?
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('Help', { _tags: 'core' })}</Text>
			</Box>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + s
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('Settings', { _tags: 'core' })}</Text>
			</Box>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + a
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('POS', { _tags: 'core' })}</Text>
			</Box>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + p
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('Products', { _tags: 'core' })}</Text>
			</Box>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + o
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('Orders', { _tags: 'core' })}</Text>
			</Box>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + c
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('Customers', { _tags: 'core' })}</Text>
			</Box>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + q
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('Support', { _tags: 'core' })}</Text>
			</Box>
			<Box horizontal space="small">
				<Box
					border
					rounding="small"
					padding="xSmall"
					style={{ backgroundColor: theme.colors.lightGrey }}
				>
					<Text weight="bold" style={{ fontFamily: 'monospace' }}>
						shift + l
					</Text>
				</Box>
				<Text style={{ alignSelf: 'center' }}>{t('Logout', { _tags: 'core' })}</Text>
			</Box>
		</Box>
	);
};

export default Help;
