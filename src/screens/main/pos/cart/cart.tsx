import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import { ButtonGroupSeparator } from '@wcpos/tailwind/src/button';
import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';

import { AddCartItemButtons } from './add-cart-item-buttons';
import { AddNoteButton } from './buttons/add-note';
import { OrderMetaButton } from './buttons/order-meta';
import PayButton from './buttons/pay';
import SaveButton from './buttons/save-order';
import VoidButton from './buttons/void';
import CartHeader from './cart-header';
import Table from './table';
import Totals from './totals';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
const Cart = () => {
	const theme = useTheme();
	const t = useT();

	return (
		<Card className="flex-1">
			<CardHeader className="p-2 bg-input">
				<ErrorBoundary>
					<CartHeader />
				</ErrorBoundary>
			</CardHeader>
			<CardContent className="flex-1 p-0">
				<Box fill>
					<ErrorBoundary>
						<Table />
					</ErrorBoundary>
				</Box>
				<AddCartItemButtons />
				<Box>
					<ErrorBoundary>
						<Totals />
					</ErrorBoundary>
				</Box>
				<HStack className="p-2 bg-secondary">
					<ErrorBoundary>
						<AddNoteButton />
						<OrderMetaButton />
						<SaveButton />
					</ErrorBoundary>
				</HStack>
				<HStack className="gap-0">
					<ErrorBoundary>
						<VoidButton />
						<ButtonGroupSeparator variant="success" />
						<PayButton />
					</ErrorBoundary>
				</HStack>
			</CardContent>
		</Card>
	);
};

export default Cart;
