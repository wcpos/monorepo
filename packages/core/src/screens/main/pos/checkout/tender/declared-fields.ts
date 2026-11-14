import {
	type DeclaredComponent,
	type DeclaredFields,
	type DeclaredValues,
	KNOWN_PREFILLS,
} from '@wcpos/order-math';

/**
 * The declared UI of contract 1.2 drawn with the app's own controls (roadmap#415 R3):
 * the gateway names components and the app lays them out in declaration order as
 * helpers above the keypad. Nothing here is the gateway's markup — a name this build
 * does not know is skipped and logged, never rendered raw.
 */

const VALUE_COMPONENTS = ['field', 'checkbox', 'select'] as const;
type ValueComponent = Extract<DeclaredComponent, { component: 'field' | 'checkbox' | 'select' }>;
type NoteComponent = Extract<DeclaredComponent, { component: 'note' }>;
// The union keeps an open member for names this build has not seen, so the literal
// discriminant does not narrow on its own; these guards do.
export function isValueComponent(component: DeclaredComponent): component is ValueComponent {
	return (VALUE_COMPONENTS as readonly string[]).includes(component.component);
}
export function isNote(component: DeclaredComponent): component is NoteComponent {
	return component.component === 'note';
}

/** What the till knows about the customer; the closed `prefill` list reads from here. */
export interface PrefillSources {
	billingEmail?: string | null;
	billingPhone?: string | null;
	customerEmail?: string | null;
	customerPhone?: string | null;
}

/** The source when it is non-empty, else the declared default (§1.2). */
export function prefillValues(fields: DeclaredFields, sources: PrefillSources): DeclaredValues {
	// The closed list, in the contract's order: order.billing.email, order.billing.phone,
	// customer.email, customer.phone (spelled by the constant, not repeated here).
	const [billingEmail, billingPhone, customerEmail, customerPhone] = KNOWN_PREFILLS;
	const bySource = new Map<string, string | null | undefined>([
		[billingEmail, sources.billingEmail],
		[billingPhone, sources.billingPhone],
		[customerEmail, sources.customerEmail],
		[customerPhone, sources.customerPhone],
	]);
	const values: DeclaredValues = {};
	for (const component of fields.components) {
		if (!isValueComponent(component)) continue;
		const prefill = 'prefill' in component ? component.prefill : null;
		const source = prefill ? bySource.get(prefill) : null;
		if (component.component === 'checkbox') {
			values[component.id] = component.default;
		} else {
			values[component.id] = source && source.trim() !== '' ? source : component.default;
		}
	}
	return values;
}

/** The first required component without a value: the commit button's disabled line names it. */
export function firstMissingRequired(
	fields: DeclaredFields,
	values: DeclaredValues
): ValueComponent | null {
	for (const component of fields.components) {
		if (!isValueComponent(component) || component.component === 'checkbox') continue;
		if (!component.required) continue;
		const value = values[component.id];
		if (typeof value !== 'string' || value.trim() === '') return component;
	}
	return null;
}

/** Where the customer was sent (spec §3.2): the first declared email or tel field's value. */
export function destinationOf(fields: DeclaredFields, values: DeclaredValues): string | null {
	for (const component of fields.components) {
		if (!isValueComponent(component) || component.component !== 'field') continue;
		if (!['email', 'tel'].includes(component.input)) continue;
		const value = values[component.id];
		if (typeof value === 'string' && value.trim() !== '') return value.trim();
		return null;
	}
	return null;
}

/** Only the values the gateway declared are posted; a stale key from an earlier method never travels. */
export function declaredValues(fields: DeclaredFields, values: DeclaredValues): DeclaredValues {
	const posted: DeclaredValues = {};
	for (const component of fields.components) {
		if (!isValueComponent(component)) continue;
		const value = values[component.id];
		if (component.component === 'checkbox') posted[component.id] = value === true;
		else if (typeof value === 'string') posted[component.id] = value;
	}
	return posted;
}
