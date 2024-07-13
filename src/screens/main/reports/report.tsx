import * as React from 'react';

import { useReactToPrint } from 'react-to-print';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Select from '@wcpos/components/src/select';
import Text from '@wcpos/components/src/text';

import { useT } from '../../../contexts/translations';

export const Report = () => {
	const theme = useTheme();
	const t = useT();
	const reportRef = React.useRef();

	/**
	 *
	 */
	const handlePrint = useReactToPrint({
		content: () => reportRef.current,
	});

	/**
	 *
	 */
	return (
		<Box padding="small" paddingLeft="none" style={{ height: '100%' }}>
			<Box
				raised
				rounding="medium"
				style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
			>
				<Box
					horizontal
					style={{
						backgroundColor: theme.colors.grey,
						borderTopLeftRadius: theme.rounding.medium,
						borderTopRightRadius: theme.rounding.medium,
					}}
				>
					<Box horizontal fill align="center" paddingY="xSmall" paddingX="small" space="small">
						<Text size="medium">{t('Report', { _tags: 'core' })}</Text>
						<Box fill>
							<Select
								options={[{ value: 'default', label: t('Default (Offline)', { _tags: 'core' }) }]}
								onChange={() => {}}
								value="default"
								size="small"
							/>
						</Box>
					</Box>
				</Box>
				<Box
					ref={reportRef}
					padding="small"
					style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
				>
					<Text>Test</Text>
				</Box>
				<Box padding="small" align="end" style={{ width: '100%' }}>
					<Button onPress={handlePrint}>{t('Print', { _tags: 'core' })}</Button>
				</Box>
			</Box>
		</Box>
	);
};
