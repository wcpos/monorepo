import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useReactToPrint } from 'react-to-print';

import { Box } from '@wcpos/components/src/box';
import { Button, ButtonText } from '@wcpos/components/src/button';
import { Card, CardContent, CardHeader, CardFooter } from '@wcpos/components/src/card';
import { HStack } from '@wcpos/components/src/hstack';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';

import { ZReport } from './template';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const Report = () => {
	const t = useT();
	const contentRef = React.useRef();
	const handlePrint = useReactToPrint({ contentRef });

	/**
	 *
	 */
	return (
		<Box className="h-full p-2 pl-0 pt-0">
			<Card className="flex-1">
				<CardHeader className="p-2 bg-input">
					<HStack>
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
				<CardContent className="flex-1 p-0">
					<ScrollView horizontal={false} className="w-full">
						<View ref={contentRef} style={{ width: '100%', height: '100%', padding: 10 }}>
							<ZReport />
						</View>
					</ScrollView>
				</CardContent>
				<CardFooter className="p-2 border-border border-t bg-muted justify-end">
					<Button onPress={handlePrint}>
						<ButtonText>{t('Print', { _tags: 'core' })}</ButtonText>
					</Button>
				</CardFooter>
			</Card>
		</Box>
	);
};
