import * as React from 'react';
import { Platform, View, type ViewProps } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Breadcrumb } from '@wcpos/components/breadcrumb';
import { usePointer } from '@wcpos/components/lib/device';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { QueryStateProvider } from '../../../../../query';
import { VariationsPane } from './variations-pane';

/** The detail pane of the products `PaneStack`: the breadcrumb and one product's variations. */
export function DrillIn({
	parent,
	back,
	stockStatus,
}: {
	parent: EngineRecord<'products'>;
	back: () => void;
	stockStatus?: string;
}) {
	const name = useDocField(parent, (value) => value.payload.name);
	const count = useDocField(parent, (value) => value.payload.variations?.length ?? 0);
	const pointer = usePointer();
	const t = useT();
	const pan = Gesture.Pan()
		.runOnJS(true)
		.enabled(pointer === 'coarse')
		.hitSlop({ left: 0, width: 24 })
		.activeOffsetX(24)
		.failOffsetY([-24, 24])
		.onEnd((event) => {
			if (event.translationX > 24) back();
		});
	return (
		<GestureDetector gesture={pan}>
			<View
				className="flex-1"
				testID="products-variations-pane"
				{...(Platform.OS === 'web'
					? {
							onKeyDown: (event: Parameters<NonNullable<ViewProps['onKeyDown']>>[0]) => {
								if (event.nativeEvent.key === 'Escape') {
									event.stopPropagation();
									back();
								}
							},
						}
					: {})}
			>
				<Breadcrumb
					parents={[
						{
							label: t('pos_products.products_crumb'),
							onPress: back,
							testID: 'products-breadcrumb-back',
						},
					]}
					here={name}
					detail={t('pos_products.n_variations', { count })}
					autoFocus
					testID="products-breadcrumb"
				/>
				{/* The table sizes itself to its parent, so it gets one that excludes the crumb. */}
				<View className="flex-1">
					<QueryStateProvider
						collection="variations"
						initialPageSize={Number.MAX_SAFE_INTEGER}
						initialSort={{ field: 'name', direction: 'asc' }}
						initialFilters={{ status: 'publish' }}
					>
						<VariationsPane parent={parent} stockStatus={stockStatus} />
					</QueryStateProvider>
				</View>
			</View>
		</GestureDetector>
	);
}
