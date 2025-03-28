import React from 'react';
import { ScrollView, View } from 'react-native';

import { useReactToPrint } from 'react-to-print';

import { Button, ButtonText } from '@wcpos/components/button';
import { Card, CardContent, CardHeader, CardFooter } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';

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
		<View className="h-full p-2 pl-0 pt-0">
			<Card className="flex-1">
				<CardHeader className="bg-input p-2">
					<HStack>
						<Text className="text-lg">{t('Report', { _tags: 'core' })}</Text>
						<Select
							value={{
								value: 'default',
								label: t('Default (Offline)', { _tags: 'core' }),
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('Select report template', { _tags: 'core' })} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem label={t('Default (Offline)', { _tags: 'core' })} value="default" />
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
				<CardFooter className="border-border bg-muted justify-end border-t p-2">
					<Button onPress={handlePrint}>
						<ButtonText>{t('Print', { _tags: 'core' })}</ButtonText>
					</Button>
				</CardFooter>
			</Card>
		</View>
	);
};
