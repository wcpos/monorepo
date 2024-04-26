import initialSettings from './initial-settings.json';

// Define a type for the keys of initialSettings
type InitialSettingsKey = keyof typeof initialSettings;

// Use a generic type for UISettingID that is constrained to InitialSettingsKey
export type UISettingID = InitialSettingsKey;

export type UISettingSchema<T extends UISettingID> = (typeof initialSettings)[T];
export type UISettingState<T extends UISettingID> = import('rxdb').RxState<UISettingSchema<T>>;

/**
 *
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
 *
 */
export const patchState = async <T extends UISettingID>(
	state: UISettingState<T>,
	data: Partial<UISettingSchema<T>>
) => {
	for (const key of Object.keys(data)) {
		const typedKey = key as keyof UISettingSchema<T>;
		await state.set(typedKey, () => data[typedKey]);
	}
	return state;
};
