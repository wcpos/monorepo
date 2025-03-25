import * as React from 'react';

import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { AddMiscProduct as AddMiscProductForm } from '@wcpos/core/screens/main/pos/cart/add-misc-product';

interface Props {
	title: string;
	children: React.ReactNode;
}

/**
 *
 */
export default function AddMiscProduct() {
	return (
		<ErrorBoundary>
			<AddMiscProductForm />
		</ErrorBoundary>
	);
}
