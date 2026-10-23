import { findEngineResident, type QueryManager } from '../mutations/resident';

import type { EngineRecord } from '../records/engine-record';

/** Wait for the scope before reading: completion replay can mount during cold boot. */
export async function readResidentOrder(
	manager: QueryManager,
	uuid: string
): Promise<EngineRecord<'orders'> | null> {
	return (await findEngineResident(
		manager,
		'orders',
		uuid
	)) as unknown as EngineRecord<'orders'> | null;
}
