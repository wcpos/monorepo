/**
 * ADR 0033 item 3: a screen holding read-only records calls every command verb without a cast.
 * Compiled by `pnpm typecheck` (tsc), never run by jest.
 */
import { isVariationRecord, useRecordField } from '@wcpos/query';
import type { RecordWriteTarget } from '@wcpos/query/mutations';
import type {
	EngineRecord,
	OrderPayload,
	ReadonlyEngineRecord,
	useQueryRuntime,
} from '@wcpos/query';

import { commandProvenance } from './pos/checkout/provenance/command-provenance';
import { closeConfirmed, closeSale, type useCloseSale } from './pos/commands/close-sale';

import type { usePushDocument } from './contexts/use-push-document';
import type { useCouponRecord } from './coupons/commands/use-coupon-record';
import type { useCustomerRecord } from './customers/commands/use-customer-record';
import type { useOrderRecord, useUndoRefusedReopen } from './orders/commands/use-order-record';
import type { useOrderLedgerWrite } from './pos/commands/use-order-ledger-write';
import type { writeOrderChanges } from './pos/commands/write-order-changes';
import type { useCatalogueRecord } from './products/commands/use-catalogue-record';

declare const order: ReadonlyEngineRecord<'orders'>;
declare const customer: ReadonlyEngineRecord<'customers'>;
declare const coupon: ReadonlyEngineRecord<'coupons'>;
declare const product: ReadonlyEngineRecord<'products'>;
declare const variation: ReadonlyEngineRecord<'variations'>;
declare const mutableOrder: EngineRecord<'orders'>;
declare const manager: ReturnType<typeof useQueryRuntime>;

declare const customers: ReturnType<typeof useCustomerRecord>;
declare const orders: ReturnType<typeof useOrderRecord>;
declare const undoRefusedReopen: ReturnType<typeof useUndoRefusedReopen>;
declare const coupons: ReturnType<typeof useCouponRecord>;
declare const catalogue: ReturnType<typeof useCatalogueRecord>;
declare const pushDocument: ReturnType<typeof usePushDocument>;
declare const ledger: ReturnType<typeof useOrderLedgerWrite>;
declare const write: typeof writeOrderChanges;
declare const close: ReturnType<typeof useCloseSale>['close'];
declare const [runtime, storeDB, , deps]: Parameters<typeof closeSale>;
declare const summary: Parameters<typeof closeConfirmed>[2];
declare const [saleCtx, , , command]: Parameters<typeof commandProvenance>;

void customers.saveCustomerFields(customer, {});
void orders.saveOrderFields(order, {});
void orders.saveOrderFields(mutableOrder, {}); // existing mutable callers still compile
void orders.reopenOrder(order, { status: 'pos-open', meta_data: [] });
void undoRefusedReopen(order, { status: 'pos-open', identity: [] });
void coupons.saveCouponFields(coupon, {});
void coupons.saveCouponChange(coupon, {});
void catalogue.saveCatalogueFields(product, {});
void catalogue.saveCatalogueChange(variation, {});
void pushDocument(order);
void ledger.recordLedger(order, { fee_lines: [], total: '0' });
void ledger.stampCompletion(order, []);
void ledger.writeLedgerChanges(order, () => ({}));
void ledger.stampCompletion({ uuid: order.uuid, isNew: false }, []); // the ledger verbs name 'orders'
void write(manager, { document: order, changes: () => ({}) });
// `useMutation().patchRecord` takes a RecordWriteTarget (the seam scan fences naming it here).
const couponTarget: RecordWriteTarget = coupon;
void couponTarget;
void closeConfirmed(runtime, order, summary);
void closeSale(runtime, storeDB, order, deps);
void close(order, { sessionId: null });
void commandProvenance(saleCtx, order, null, command);

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function useReadonlyFieldContract(): void {
	const total = useRecordField(order, (data) => {
		const inferred: Equal<typeof data.payload, OrderPayload> = true; // C is inferred, not widened
		void inferred;
		return data.payload.total;
	});
	const mutableTotal = useRecordField(mutableOrder, (data) => {
		const inferred: Equal<typeof data.payload, OrderPayload> = true;
		void inferred;
		return data.payload.total;
	});
	const parentId = isVariationRecord(variation) ? variation.payload.parent_id : undefined;
	void [total, mutableTotal, parentId, product];
}
void useReadonlyFieldContract;

// @ts-expect-error a bare `{ id }` carries no record identity: it is not a write target
void ledger.stampCompletion({ id: 'order' }, []);
// @ts-expect-error `patchRecord` names no collection, so an identity is not a record it can serve
const identityTarget: RecordWriteTarget = { uuid: order.uuid, isNew: false };
void identityTarget;
