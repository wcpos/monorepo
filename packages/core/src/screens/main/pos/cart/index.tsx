import * as React from 'react';
import { View } from 'react-native';

import { ButtonGroupSeparator } from '@wcpos/components/button';
import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';

import { AddNoteButton } from './buttons/add-note';
import { OrderMetaButton } from './buttons/order-meta';
import { PayButton } from './buttons/pay';
import { SaveButton } from './buttons/save-order';
import { VoidButton } from './buttons/void';
import { CartHeader } from './cart-header';
import { CartTable } from './table';
import { OpenOrderTabs } from './tabs';
import { Totals } from './totals';
import { CartTotalsChangedBanner } from './totals-changed-banner';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *

 */
export function OpenOrders({ isColumn = false }) {
	const { currentOrder } = useCurrentOrder();

	if (!currentOrder) {
		throw new Error('Current order is not defined');
	}

	const isNewOrder = (currentOrder as unknown as { isNew: boolean }).isNew;

	/**
	 * Remember the draft (unsaved) order's uuid. The first add saves the draft
	 * under the SAME uuid and only then mounts CartTable — with the line already
	 * in its data — so the table alone cannot tell that row apart from an
	 * existing order's rows. This ref lets it pulse the first add too.
	 */
	const lastDraftOrderUuidRef = React.useRef<string | undefined>(undefined);
	React.useEffect(() => {
		// This runs AFTER CartTable's effects in the same commit (parent effects
		// follow child effects), so on the commit where the draft becomes a real
		// order the table reads the uuid first, then it is cleared here.
		lastDraftOrderUuidRef.current = isNewOrder ? currentOrder.uuid : undefined;
	});

	/**
	 *
	 */
	return (
		<VStack className={`h-full gap-1 p-2 ${isColumn && 'pl-0'}`}>
			<ErrorBoundary>
				{isNewOrder ? (
					<Card className="flex-1">
						<CardHeader className="bg-card-header p-2">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
						</CardHeader>
						<CardContent className="flex-1 p-0" />
					</Card>
				) : (
					<Card className="flex-1">
						<CardHeader className="bg-card-header p-2">
							<ErrorBoundary>
								<CartHeader />
							</ErrorBoundary>
						</CardHeader>
						<CardContent className="border-border flex-1 border-t p-0">
							<View className="flex-1">
								<ErrorBoundary>
									<CartTable lastDraftOrderUuidRef={lastDraftOrderUuidRef} />
								</ErrorBoundary>
							</View>
							<ErrorBoundary>
								<CartTotalsChangedBanner />
							</ErrorBoundary>
							<ErrorBoundary>
								<Totals />
							</ErrorBoundary>
							<HStack className="bg-footer p-2">
								<View className="flex-1">
									<AddNoteButton />
								</View>
								<View className="flex-1">
									<OrderMetaButton />
								</View>
								<View className="flex-1">
									<SaveButton />
								</View>
							</HStack>
							<HStack className="w-full gap-0">
								<ErrorBoundary>
									<VoidButton />
									<ButtonGroupSeparator className="bg-card-header" />
									<PayButton />
								</ErrorBoundary>
							</HStack>
						</CardContent>
					</Card>
				)}
			</ErrorBoundary>
			<ErrorBoundary>
				<Suspense>
					<OpenOrderTabs />
				</Suspense>
			</ErrorBoundary>
		</VStack>
	);
}
