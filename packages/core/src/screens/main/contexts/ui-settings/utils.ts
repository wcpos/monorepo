import set from 'lodash/set';

import initialSettings from './initial-settings.json';

// Define a type for the keys of initialSettings
type InitialSettingsKey = keyof typeof initialSettings;

// Use a generic type for UISettingID that is constrained to InitialSettingsKey
export type UISettingID = InitialSettingsKey;

export type UISettingSchema<T extends UISettingID> = (typeof initialSettings)[T];
export type UISettingState<T extends UISettingID> = import('rxdb').RxState<UISettingSchema<T>>;

/**
 * @TODO - this handles the first depth of the schema, but not nested values
 * If we change nested schema (eg: columns), we'll need to update this
 */
export const mergeWithInitalValues = async (
	id: UISettingID,
	state: UISettingState<UISettingID>
) => {
	const initial = initialSettings[id];
	const current = state.get();

	// Loop through initial values and set them if they don't exist
	for (const key of Object.keys(initial)) {
		const typedKey = key as keyof typeof initial;
		if (current[typedKey] === undefined) {
			await state.set(typedKey, (val) => initial[typedKey]);
		}
	}
};

/**
 *
 */
export const resetToInitialValues = async (id: UISettingID, state: UISettingState<UISettingID>) => {
	const initial = initialSettings[id];

	// Loop through current values and reset them if they exist
	for (const key of Object.keys(initial)) {
		const typedKey = key as keyof typeof initial;
		await state.set(typedKey, (val) => initial[typedKey]);
	}
};

/**
 * This is a bit of a mess, because setting nested values from the Form component is tricky
 *
 * Note: RxState doesn't allow null values in ops (schema requires v to be present).
 * We skip null/undefined values to avoid VD2 validation errors.
 */
export const patchState = async <T extends UISettingID>(
	state: UISettingState<T>,
	data: Partial<UISettingSchema<T>>
) => {
	for (const key of Object.keys(data)) {
		const value = (data as Record<string, unknown>)[key];

		// Skip null/undefined values - RxState schema doesn't allow them
		if (value === null || value === undefined) {
			continue;
		}

		const path = key.split('.');
		const root = path.shift()!;
		const typedKey = root as keyof UISettingSchema<T>;
		// @ts-expect-error: RxState.set path type is too narrow for dynamic keys
		await state.set(typedKey, (old: Record<string, unknown>) => {
			if (path.length > 0) {
				return set(old, path, value);
			} else {
				return value;
			}
		});
	}
	return state;
};
