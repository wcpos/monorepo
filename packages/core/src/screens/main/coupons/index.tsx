import React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { useQuery } from '@wcpos/query';

import { Actions } from './cells/actions';
import { DiscountType } from './cells/discount-type';
import { Usage } from './cells/usage';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { useProAccess } from '../contexts/pro-access';
import { DataTable } from '../components/data-table';
import { TextCell } from '../components/text-cell';
import { DateCell } from '../components/date';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsDialog } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

const cells = {
	discount_type: DiscountType,
	usage_count: Usage,
	actions: Actions,
	date_expires_gmt: DateCell,
	date_created_gmt: DateCell,
	date_modified_gmt: DateCell,
};

function renderCell(columnKey: string, info: Record<string, unknown>) {
	const Renderer = cells[columnKey as keyof typeof cells];
	if (Renderer) {
		return <Renderer {...(info as any)} />;
	}

	return <TextCell {...(info as any)} />;
}

export function CouponsScreen() {
	const { uiSettings } = useUISettings('coupons');
	const t = useT();
	const router = useRouter();
	const { bottom } = useSafeAreaInsets();
	const { readOnly } = useProAccess();

	const query = useQuery({
		queryKeys: ['coupons'],
		collectionName: 'coupons',
		initialParams: {
			sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection } as Record<string, 'asc' | 'desc'>],
		},
		infiniteScroll: true,
	});

	return (
		<View
			testID="screen-coupons"
			className="h-full p-2"
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-0">
					<HStack className="p-2">
						<QuerySearchInput
							query={query!}
							placeholder={t('common.search_coupons')}
							className="flex-1"
							testID="search-coupons"
						/>
						<Tooltip>
							<TooltipTrigger asChild>
								<IconButton
									name="circlePlus"
									onPress={() => router.push({ pathname: '/coupons/add' })}
									disabled={readOnly}
								/>
							</TooltipTrigger>
							<TooltipContent>
								<Text>{readOnly ? t('common.upgrade_to_pro') : t('coupons.add_coupon')}</Text>
							</TooltipContent>
						</Tooltip>
						<UISettingsDialog title={t('coupons.coupon_settings')}>
							<UISettingsForm />
						</UISettingsDialog>
					</HStack>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable
								id="coupons"
								query={query!}
								renderCell={renderCell}
								noDataMessage={t('common.no_coupons_found')}
								estimatedItemSize={100}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}
