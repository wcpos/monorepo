import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { AddMiscProduct as AddMiscProductForm } from '@wcpos/core/screens/main/pos/cart/add-misc-product';

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
