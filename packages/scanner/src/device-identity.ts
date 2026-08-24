/**
 * One canonical identity for a registered scanner.
 *
 * Every lane used to hand-roll its own "is this live device the one in this
 * profile?" comparison — five matchers over four different field combinations,
 * with the Bluetooth one lowercasing on the write path but not on the read path.
 * That is the whole reason this module exists: the key is composed here, once,
 * and every consumer compares strings.
 *
 * The key is also the collection's primary key, so RxDB enforces "one profile
 * per device" for free — no in-flight guard, no read-then-insert race.
 *
 * Known ceiling, unchanged from the per-lane matchers this replaces: a key
 * identifies a *model or service*, not a *unit*. Two identical USB scanners on
 * one till share a vid:pid and therefore one profile, exactly as they did
 * before. Platforms expose no stable per-unit id we could use instead (a USB
 * serial number is optional and absent on most retail scanners), so promoting
 * one would mint a different key depending on whether the platform felt like
 * reporting it — and silently break reconnect when it didn't.
 */

export type ScannerConnectionType =
	'keyboard' | 'usb-serial' | 'bluetooth-spp' | 'bluetooth-le' | 'hid-pos';

/**
 * The identifying facts each lane can actually observe. Deliberately a
 * discriminated union rather than a bag of optionals: it is a type error to
 * build a Bluetooth key out of USB ids.
 */
export type ScannerIdentity =
	| {
			connectionType: 'keyboard';
			vendorId: number;
			productId: number;
			deviceName: string;
	  }
	| { connectionType: 'usb-serial'; vendorId: number; productId: number }
	| { connectionType: 'hid-pos'; vendorId: number; productId: number }
	| { connectionType: 'bluetooth-spp'; serviceUuid: string }
	| { connectionType: 'bluetooth-le'; peripheralId: string };

/** Primary-key ceiling. The only unbounded input is an Android device name. */
export const SCANNER_DEVICE_KEY_MAX_LENGTH = 128;

const DEVICE_NAME_KEY_MAX_LENGTH = 64;

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Lowercase + trim. Bluetooth UUIDs arrive from `SerialPort.getInfo()`, from
 * BLE scan results and from a merchant typing one into settings; the three
 * disagree about case, and comparing them raw is how the same scanner ends up
 * registered twice.
 */
export function normalizeUuid(value: string): string {
	return value.trim().toLowerCase();
}

/** True for a full 128-bit UUID in canonical 8-4-4-4-12 form, already normalized. */
export function isCanonicalUuid(value: string): boolean {
	return CANONICAL_UUID_PATTERN.test(normalizeUuid(value));
}

/**
 * Device names are display data, not identity data — they arrive with vendor
 * padding and inconsistent case. Fold them hard for key purposes; the profile
 * keeps the raw name in `deviceName` for the UI.
 */
function foldDeviceName(deviceName: string): string {
	return deviceName.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, DEVICE_NAME_KEY_MAX_LENGTH);
}

/**
 * Compose the canonical key. The connection type is part of the key so the same
 * physical scanner registered over two different transports stays two profiles —
 * they reconnect differently and the merchant should see both.
 */
export function scannerDeviceKey(identity: ScannerIdentity): string {
	switch (identity.connectionType) {
		case 'keyboard':
			// vid:pid alone is too coarse here: on Android the built-in virtual
			// keyboard and a paired scanner can both report 0:0, so the folded name
			// is what keeps them apart.
			return `keyboard:${identity.vendorId}:${identity.productId}:${foldDeviceName(
				identity.deviceName
			)}`;
		case 'usb-serial':
			return `usb-serial:${identity.vendorId}:${identity.productId}`;
		case 'hid-pos':
			return `hid-pos:${identity.vendorId}:${identity.productId}`;
		case 'bluetooth-spp':
			return `bluetooth-spp:${normalizeUuid(identity.serviceUuid)}`;
		case 'bluetooth-le':
			return `bluetooth-le:${normalizeUuid(identity.peripheralId)}`;
	}
}

/**
 * Which transport the merchant is looking at. Derived from the connection type
 * rather than stored, so there is exactly one authority for the mapping.
 *
 * `hid-pos` is deliberately `unknown`: WebHID reports no bus, and Chromium can
 * surface Bluetooth HID devices through it, so claiming "USB" would be a guess
 * shown to a merchant as a fact.
 */
export type ScannerTransport = 'usb' | 'bluetooth' | 'unknown';

export function scannerTransport(connectionType: ScannerConnectionType): ScannerTransport {
	switch (connectionType) {
		case 'usb-serial':
			return 'usb';
		case 'bluetooth-spp':
		case 'bluetooth-le':
			return 'bluetooth';
		case 'keyboard':
		case 'hid-pos':
			return 'unknown';
	}
}
