import * as React from 'react';

import { useReactToPrint } from 'react-to-print';
import { useTheme } from 'styled-components/native';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Card, CardContent, CardHeader, CardFooter } from '@wcpos/tailwind/src/card';
import { HStack } from '@wcpos/tailwind/src/hstack';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/tailwind/src/select';
import { Text } from '@wcpos/tailwind/src/text';

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
		<Card>
			<CardHeader>
				<HStack className="p-2">
					<Text className="text-lg">{t('Report', { _tags: 'core' })}</Text>
					<Select
						defaultValue={{
							value: 'default',
							label: t('Default (Offline)', { _tags: 'core' }),
						}}
					>
						<SelectTrigger>
							<SelectValue
								placeholder={t('Select report template', { _tags: 'core' })}
							></SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem label={t('Default (Offline)', { _tags: 'core' })} value="default">
								{t('Default (Offline)', { _tags: 'core' })}
							</SelectItem>
						</SelectContent>
					</Select>
				</HStack>
			</CardHeader>
			<CardContent ref={reportRef}>
				<Text>Test</Text>
			</CardContent>
			<CardFooter>
				<Button onPress={handlePrint}>
					<ButtonText>{t('Print', { _tags: 'core' })}</ButtonText>
				</Button>
			</CardFooter>
		</Card>
	);
};
