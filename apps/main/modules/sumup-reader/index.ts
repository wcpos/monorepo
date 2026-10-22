import { requireOptionalNativeModule } from 'expo-modules-core';

export type ReaderStatus = {
	connected: boolean;
	serial: string;
	model: string;
	battery: number | null;
};
export type CheckoutResult = {
	outcome: 'success' | 'cancelled' | 'failed' | 'unknown';
	transactionCode?: string | null;
	amount?: string | null;
	tipAmount?: string | null;
	currency?: string | null;
	cardType?: string | null;
	last4?: string | null;
	message?: string | null;
	resultCode?: number | null;
	/** Android's `tx-type`: true when an offline session took the payment. iOS has no marker. */
	offline?: boolean | null;
};
export type SumUpReader = {
	setup(affiliateKey: string): Promise<void>;
	isLoggedIn(): Promise<boolean>;
	login(options: { accessToken?: string }): Promise<void>;
	logout(): Promise<void>;
	merchant(): Promise<{ merchantCode: string; currencyCode: string } | null>;
	openReaderSettings(): Promise<void>;
	readerStatus(): Promise<ReaderStatus | null>;
	isTipOnReaderAvailable(): Promise<boolean>;
	prepareForCheckout(): Promise<void>;
	/**
	 * SumUp's offline session (Solo and Solo Lite): while active, EVERY checkout is offline.
	 * `pending`: this app started one SumUp has not confirmed uploaded (no SDK call when false).
	 *
	 * The four offline methods are dormant and kept on purpose (Paul, 2026-10-23, monorepo#2847
	 * closed unmerged): no caller starts a session until the offline tender outbox of ADR 0040
	 * §offline lands (`OFFLINE_TENDERS_QUEUE`), and the native side was validated on a physical
	 * Solo in #2495. The status of that outbox is in woocommerce-pos ADR 0040, "Offline tenders:
	 * status". Do not delete them as dead code; see `lib/payment-drivers/sumup/driver.ts`.
	 */
	offlineSession(): Promise<{ active: boolean; pending: boolean }>;
	startOfflineSession(): Promise<void>;
	/** Uploads the stored offline payments and ends the session; rejects if the upload fails. */
	uploadOffline(): Promise<void>;
	/** Downloads SumUp's offline limits (Android); iOS does this itself after login. */
	prepareOffline(): Promise<void>;
	checkout(options: {
		amount: string;
		currency: string;
		title: string;
		foreignTransactionId: string;
		tipOnReader: boolean;
		skipSuccessScreen: true;
	}): Promise<CheckoutResult>;
	addListener(
		event: 'onReaderStatus',
		listener: (event: { reader: ReaderStatus | null }) => void
	): { remove(): void };
};
export const getSumUpReader = () => requireOptionalNativeModule<SumUpReader>('SumUpReader');
