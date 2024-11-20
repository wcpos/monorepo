import type { KeyboardEvent } from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
export { useHotkeys, useHotkeysContext, useRecordHotkeys } from 'react-hotkeys-hook';

export type RNKeyboardEvent = KeyboardEvent | NativeSyntheticEvent<TextInputKeyPressEventData>;

/**
 * Helpers
 */
/**
 * Checks if a string is alphanumeric.
 *
 * @param str - The string to test.
 * @returns {boolean} - True if the string is alphanumeric, false otherwise.
 */
export function isAlphaNumeric(str: string): boolean {
	const regex = new RegExp(`^[a-zA-Z0-9]$`);
	return regex.test(str);
}

/**
 * Extracts the key from a keyboard event or a native synthetic event.
 *
 * @param event - The keyboard event or native synthetic event.
 * @returns {string | null} - The key if it exists in the event, null otherwise.
 */
export function getKeyFromEvent(event: RNKeyboardEvent): string | null {
	if ('key' in event) {
		return event.key;
	} else if ('nativeEvent' in event && 'key' in event.nativeEvent) {
		return event.nativeEvent.key;
	}

	return null;
}
