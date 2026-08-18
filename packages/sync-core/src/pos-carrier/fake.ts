import { type MetaDataEntry, type PosCarrier, wooMetaCarrier } from './carrier';

export type FakeCarrierState = {
	cashierId: string | null;
	storeId: string | null;
	taxBasedOn: string | null;
	lineUuids: string[];
};

export function createFakeCarrier(
	initial: Partial<FakeCarrierState> = {}
): PosCarrier & { state: FakeCarrierState } {
	const state: FakeCarrierState = {
		cashierId: initial.cashierId ?? null,
		storeId: initial.storeId ?? null,
		taxBasedOn: initial.taxBasedOn ?? null,
		lineUuids: [...(initial.lineUuids ?? [])],
	};
	const recordLineUuid = (uuid: string | null) => {
		if (uuid !== null && !state.lineUuids.includes(uuid)) state.lineUuids.push(uuid);
		return uuid;
	};
	const carrier: PosCarrier & { state: FakeCarrierState } = {
		state,
		readIdentity(meta) {
			if (meta === undefined) {
				return { cashierId: state.cashierId, storeId: state.storeId };
			}
			const identity = wooMetaCarrier.readIdentity(meta);
			state.cashierId = identity.cashierId;
			state.storeId = identity.storeId;
			return identity;
		},
		stampIdentity(meta, identity) {
			const stamped = wooMetaCarrier.stampIdentity(meta, identity);
			const decoded = wooMetaCarrier.readIdentity(stamped);
			state.cashierId = decoded.cashierId;
			state.storeId = decoded.storeId;
			return stamped;
		},
		taxBasedOnOverride(meta) {
			if (meta === undefined) return state.taxBasedOn;
			state.taxBasedOn = wooMetaCarrier.taxBasedOnOverride(meta);
			return state.taxBasedOn;
		},
		lineUuid(line) {
			return recordLineUuid(wooMetaCarrier.lineUuid(line));
		},
		ensureLineUuid<L extends { meta_data?: MetaDataEntry[] }>(line: L, mintUuid: () => string): L {
			const ensured = wooMetaCarrier.ensureLineUuid(line, mintUuid);
			recordLineUuid(wooMetaCarrier.lineUuid(ensured));
			return ensured;
		},
		identityFilter(identity) {
			return wooMetaCarrier.identityFilter(identity);
		},
		decodeIdentityFilter(selector) {
			return wooMetaCarrier.decodeIdentityFilter(selector);
		},
	};
	return carrier;
}
