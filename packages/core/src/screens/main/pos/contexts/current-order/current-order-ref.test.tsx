/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import {
	type CurrentOrderActions,
	CurrentOrderProvider,
	type OpenOrderHit,
	useCurrentOrderActions,
} from './index';

jest.mock('expo-router', () => ({
	useRouter: () => ({ setParams: jest.fn() }),
}));

jest.mock('@wcpos/utils/platform', () => ({
	Platform: { isWeb: false },
}));

jest.mock('./use-new-order', () => ({
	useNewOrder: () => ({ newOrder: { uuid: 'new-order' } }),
}));

function orderRecord(uuid: string) {
	return { uuid, payload: {} } as unknown as import('@wcpos/query').EngineRecord<'orders'>;
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
 * Reads getCurrentOrderRecord() from a passive effect. Child passive effects run BEFORE the
 * parent provider's passive effects, so this stands in for any post-commit callback
 * (e.g. the hardware-scan RxJS subscription) that fires before the provider's own
 * passive effects flush.
 */
function ReadOnMarkerChange({ marker }: { marker: string }) {
	const currentOrderActions = useCurrentOrderActions();
	React.useEffect(() => {
		reads.push({
			marker,
			uuid: currentOrderActions.getCurrentOrderRecord().uuid,
		});
	}, [marker, currentOrderActions]);
	return null;
}

function App({
	marker,
	resource,
}: {
	marker: string;
	resource: ObservableResource<OpenOrderHit[]>;
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

describe('CurrentOrderProvider getCurrentOrderRecord', () => {
	beforeEach(() => {
		actions = undefined;
		reads.length = 0;
	});

	/**
	 * #1294 P1: a scan subscription callback can resolve getCurrentOrderRecord() after the
	 * commit that switched orders but before the provider's passive effects run. If the
	 * currentOrderRef write lives in a passive useEffect, that reader gets the PREVIOUS
	 * order and the scanned item lands in the wrong cart. The ref write must be
	 * commit-synchronous (layout), so every post-commit reader sees the new order.
	 */
	it('resolves the just-switched order for readers that run before the provider passive effects', () => {
		const orders$ = new BehaviorSubject([
			{ id: 'order-a', record: orderRecord('record-a') },
			{ id: 'order-b', record: orderRecord('record-b') },
		]);
		const resource = new ObservableResource(orders$);

		const { rerender } = render(<App marker="initial" resource={resource} />);

		expect(actions).toBeDefined();
		expect(actions!.getCurrentOrderRecord().uuid).toBe('record-a');

		act(() => {
			// One batch: switch the order and give the reader a new marker so its passive
			// effect re-fires in the same commit — before the provider's passive effects.
			actions!.setCurrentOrderID('order-b');
			rerender(<App marker="switched" resource={resource} />);
		});

		const switchedRead = reads.find((read) => read.marker === 'switched');
		expect(switchedRead).toBeDefined();
		expect(switchedRead!.uuid).toBe('record-b');
		expect(actions!.getCurrentOrderRecord().uuid).toBe('record-b');
	});
});
