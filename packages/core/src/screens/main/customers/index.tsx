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
import { Address } from './cells/address';
import { Avatar } from './cells/avatar';
import { CustomerEmail } from './cells/email';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { TextCell } from '../components/text-cell';
import { Date } from '../components/date';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsDialog } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

const cells = {
	avatar_url: Avatar,
	billing: Address,
	shipping: Address,
	actions: Actions,
	email: CustomerEmail,
	date_created_gmt: Date,
	date_modified_gmt: Date,
};

function renderCell(columnKey: string, info: any) {
	const Renderer = cells[columnKey];
	if (Renderer) {
		return <Renderer {...info} />;
	}

	return <TextCell {...info} />;
}

/**
 *
 */
export function CustomersScreen() {
	const { uiSettings } = useUISettings('customers');
	const t = useT();
	const router = useRouter();
	const { bottom } = useSafeAreaInsets();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['customers'],
		collectionName: 'customers',
		initialParams: {
			sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection }],
		},
		infiniteScroll: true,
	});

	/**
	 *
	 */
	return (
		<View className="h-full p-2" style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-0">
					<HStack className="p-2">
						<QuerySearchInput
							query={query}
							placeholder={t('Search Customers', { _tags: 'core' })}
							className="flex-1"
						/>
						<Tooltip>
							<TooltipTrigger asChild>
								<IconButton
									name="userPlus"
									onPress={() => router.push({ pathname: '/customers/add' })}
								/>
							</TooltipTrigger>
							<TooltipContent>
								<Text>{t('Add new customer', { _tags: 'core' })}</Text>
							</TooltipContent>
						</Tooltip>
						<UISettingsDialog title={t('Customer Settings', { _tags: 'core' })}>
							<UISettingsForm />
						</UISettingsDialog>
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<DataTable
								id="customers"
								query={query}
								renderCell={renderCell}
								noDataMessage={t('No customers found', { _tags: 'core' })}
								estimatedItemSize={100}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}
