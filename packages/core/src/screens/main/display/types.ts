export interface DisplayPairing {
	code: string;
	expires_at: string;
}

export interface PairedDisplay {
	// Display ids are opaque strings (d_…), never numeric.
	id: string;
	name: string;
	device_id: string;
	paired_at: string;
	last_seen: string | null;
	connected: boolean;
}

export type DisplaySignalType = 'offer' | 'answer' | 'candidate' | 'bye';

export interface DisplaySignalMessage {
	from: `pos:${string}`;
	to: 'display';
	type: DisplaySignalType;
	session: string;
	body: unknown;
}

export interface ReceivedDisplaySignal {
	id: number;
	from: string;
	to: string;
	type: DisplaySignalType;
	session: string;
	body: unknown;
	created_at?: number | string;
}

export interface DisplaySignalsResponse {
	messages: ReceivedDisplaySignal[];
}

export interface PostedDisplaySignal {
	id: number;
}
