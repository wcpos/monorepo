import isEqual from 'lodash/isEqual';
import set from 'lodash/set';

import initialSettings from './initial-settings.json';

// Define a type for the keys of initialSettings
type InitialSettingsKey = keyof typeof initialSettings;

// Use a generic type for UISettingID that is constrained to InitialSettingsKey
export type UISettingID = InitialSettingsKey;

export type UISettingSchema<T extends UISettingID> = (typeof initialSettings)[T];
export type UISettingState<T extends UISettingID> = import('rxdb').RxState<UISettingSchema<T>>;

/**
 * Enum-valued settings, keyed by the vocabulary the UI can actually render.
 *
 * The merge below only fills in keys that are MISSING, so a persisted value that has
 * fallen outside its enum — a state doc written by a build with a different
 * vocabulary, or hand-edited — would survive forever and reach the settings form as a
 * toggle with no matching option. Anything not in the list here is reset to the
 * authored default. Add an entry when a new enum setting lands.
 */
const ENUM_VOCABULARIES: Partial<Record<UISettingID, Record<string, readonly string[]>>> = {
	'pos-products': { position: ['left', 'right'] },
};

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
		const currentValue = current[typedKey];
		const initialValue = initial[typedKey];

		if (currentValue === undefined) {
			await state.set(typedKey, (val) => initial[typedKey]);
			continue;
		}

		const vocabulary = ENUM_VOCABULARIES[id]?.[key];
		if (vocabulary && !vocabulary.includes(currentValue as string)) {
			await state.set(typedKey, () => initial[typedKey]);
			continue;
		}

		if (key === 'columns' && Array.isArray(currentValue) && Array.isArray(initialValue)) {
			type ColumnConfig = {
				key: string;
				display?: { key: string; show?: boolean; hide?: boolean }[];
				[key: string]: unknown;
			};
			type DisplayConfig = NonNullable<ColumnConfig['display']>[number];
			const currentColumns = currentValue as ColumnConfig[];
			const initialColumns = initialValue as ColumnConfig[];

			const mergedColumns = currentColumns.map((currentColumn) => {
				const initialColumn = initialColumns.find((column) => column.key === currentColumn.key);

				// A column the initial settings don't declare (e.g. injected by Pro)
				// passes through untouched.
				if (!initialColumn) {
					return currentColumn;
				}

				// The initial settings are authoritative for capability/presentation
				// keys (disableSort, width, flex, align, hideLabel, …); only the
				// user's actual preferences survive from persisted state: column
				// order (the order of `currentColumns`), `show`, and the `show` of
				// display sub-entries. Spreading the persisted column wholesale kept
				// stale capability flags alive forever on upgraded installs — a sort
				// un-disabled in initial-settings.json (#1347 coupons `code`, #1207
				// products `type`) never reached existing profiles.
				const merged: ColumnConfig = { ...initialColumn };
				if (typeof currentColumn.show === 'boolean') {
					merged.show = currentColumn.show;
				}
				if (Array.isArray(initialColumn.display)) {
					merged.display = initialColumn.display.map((initialDisplay: DisplayConfig) => {
						const currentDisplay = Array.isArray(currentColumn.display)
							? currentColumn.display.find(
									(display: DisplayConfig) => display.key === initialDisplay.key
								)
							: undefined;
						return typeof currentDisplay?.show === 'boolean'
							? { ...initialDisplay, show: currentDisplay.show }
							: { ...initialDisplay };
					});
				}
				return merged;
			});

			const missingColumns = initialColumns.filter(
				(initialColumn) => !currentValue.some((column) => column.key === initialColumn.key)
			);
			const nextColumns = [...mergedColumns, ...missingColumns];
			const hasColumnDifferences = !isEqual(nextColumns, currentValue);

			if (hasColumnDifferences) {
				await state.set(typedKey, () => nextColumns as UISettingSchema<typeof id>[typeof typedKey]);
			}
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
