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
