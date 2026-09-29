import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Card, CardContent, CardFooter, CardHeader } from '@wcpos/components/card';
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
import { useReportPrint } from './use-report-print';
import { useReportsPeriod } from '../context';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export function Report({ nestedScrollEnabled = false }: { nestedScrollEnabled?: boolean } = {}) {
	const t = useT();
	const { storeId } = useReportsPeriod();
	const { print, isPrinting, contentRef } = useReportPrint(storeId);

	return (
		<View testID="reports-content" className="h-full p-2 pt-0 pl-0">
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<HStack>
						<Text className="text-lg">{t('reports.report')}</Text>
						<Select
							value={{
								value: 'default',
								label: t('reports.default_offline'),
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder={t('reports.select_report_template')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem label={t('reports.default_offline')} value="default" />
							</SelectContent>
						</Select>
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ScrollView
						horizontal={false}
						className="w-full"
						nestedScrollEnabled={nestedScrollEnabled}
					>
						<View ref={contentRef} style={{ width: '100%', height: '100%', padding: 10 }}>
							<ZReport storeId={storeId} />
						</View>
					</ScrollView>
				</CardContent>
				<CardFooter className="border-border bg-footer justify-end border-t p-2">
					<Button testID="reports-print-button" onPress={print} loading={isPrinting}>
						<ButtonText>{t('reports.print')}</ButtonText>
					</Button>
				</CardFooter>
			</Card>
		</View>
	);
}
