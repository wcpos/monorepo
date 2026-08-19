/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import { type CurrentOrderActions, CurrentOrderProvider, useCurrentOrderActions } from './index';

type OrderDocument = import('@wcpos/database').OrderDocument;

jest.mock('expo-router', () => ({
	useRouter: () => ({ setParams: jest.fn() }),
}));

jest.mock('@wcpos/utils/platform', () => ({
	Platform: { isWeb: false },
}));

jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order' } }),
}));

function orderDocument(uuid: string): OrderDocument {
	return { uuid } as unknown as OrderDocument;
}

let actions: CurrentOrderActions | undefined;
const reads: { marker: string; uuid: string | undefined }[] = [];

function CaptureActions() {
	const currentOrderActions = useCurrentOrderActions();
	React.useEffect(() => {
		actions = currentOrderActions;
	}, [currentOrderActions]);
	return null;
}

/**
 * Reads getCurrentOrder() from a passive effect. Child passive effects run BEFORE the
 * parent provider's passive effects, so this stands in for any post-commit callback
 * (e.g. the hardware-scan RxJS subscription) that fires before the provider's own
 * passive effects flush.
 */
function ReadOnMarkerChange({ marker }: { marker: string }) {
	const currentOrderActions = useCurrentOrderActions();
	React.useEffect(() => {
		reads.push({
			marker,
			uuid: (currentOrderActions.getCurrentOrder() as { uuid?: string })?.uuid,
		});
	}, [marker, currentOrderActions]);
	return null;
}

function App({
	marker,
	resource,
}: {
	marker: string;
	resource: ObservableResource<{ id: string; document: OrderDocument }[]>;
}) {
	return (
		<React.Suspense fallback={null}>
			<CurrentOrderProvider resource={resource} currentOrderUUID="order-a">
				<CaptureActions />
				<ReadOnMarkerChange marker={marker} />
			</CurrentOrderProvider>
		</React.Suspense>
	);
}

describe('CurrentOrderProvider getCurrentOrder', () => {
	beforeEach(() => {
		actions = undefined;
		reads.length = 0;
	});

	/**
	 * #1294 P1: a scan subscription callback can resolve getCurrentOrder() after the
	 * commit that switched orders but before the provider's passive effects run. If the
	 * currentOrderRef write lives in a passive useEffect, that reader gets the PREVIOUS
	 * order and the scanned item lands in the wrong cart. The ref write must be
	 * commit-synchronous (layout), so every post-commit reader sees the new order.
	 */
	it('resolves the just-switched order for readers that run before the provider passive effects', () => {
		const orders$ = new BehaviorSubject([
			{ id: 'order-a', document: orderDocument('order-a') },
			{ id: 'order-b', document: orderDocument('order-b') },
		]);
		const resource = new ObservableResource(orders$);

		const { rerender } = render(<App marker="initial" resource={resource} />);

		expect(actions).toBeDefined();
		expect((actions!.getCurrentOrder() as { uuid?: string })?.uuid).toBe('order-a');

		act(() => {
			// One batch: switch the order and give the reader a new marker so its passive
			// effect re-fires in the same commit — before the provider's passive effects.
			actions!.setCurrentOrderID('order-b');
			rerender(<App marker="switched" resource={resource} />);
		});

		const switchedRead = reads.find((read) => read.marker === 'switched');
		expect(switchedRead).toBeDefined();
		expect(switchedRead!.uuid).toBe('order-b');
	});
});
