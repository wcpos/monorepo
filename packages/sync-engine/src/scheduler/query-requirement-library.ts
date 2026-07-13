import {
	runSchedulerCoverageFlow,
	type SchedulerCoverageFlowRequirement,
	type SchedulerCoverageFlowResult,
} from './scheduler-coverage-flow';

import type { CoverageStrategy, LocalCoverageState } from './coverage-model';
import type {
	ConnectivityMode,
	ReplicationPolicy,
	ReplicationRequirement,
} from './replication-policy';
import type { SchedulerFetcher } from './replication-scheduler';

export type QueryRequirementDeclaration = {
	componentId: string;
	id: string;
	collection: string;
	kind?: ReplicationRequirement['kind'];
	queryKey: string;
	ids?: string[];
	/**
	 * Numeric Woo server ids for a `targeted-records` declaration — REQUIRED-by-contract
	 * alongside `ids` for collections whose targeted fetchers read the explicit channel
	 * (orders/products): document keys are uuids, so the server id is unrecoverable from
	 * `ids`, and those fetchers throw a contract error on a task without `wooIds` (see
	 * {@link ReplicationRequirement.wooIds}). toRequirement carries it through, so a
	 * declaration can never mint an ids-without-wooIds task. (The customer collection's
	 * born-local sentinel `customer:default` is the one targeted id with no numeric
	 * counterpart — its fetcher resolves targets from `ids` and ignores this channel.)
	 */
	wooIds?: number[];
	expectedRecordIds?: string[];
	currentRecordIds?: string[];
	totalMatchingRecords?: number | null;
	coverageStrategy: CoverageStrategy;
	policy: ReplicationPolicy;
};

export type SchedulerCoverageFlowRequirementWithSources = SchedulerCoverageFlowRequirement & {
	declaredBy: string[];
};

export type BuildSchedulerCoverageRequirementsInput = {
	coverageState: LocalCoverageState;
	declarations: QueryRequirementDeclaration[];
};

export type QueryRequirementFlowInput = BuildSchedulerCoverageRequirementsInput & {
	connectivity: ConnectivityMode;
	fetcher: SchedulerFetcher;
};

export type QueryRequirementFlowResult = {
	requirements: SchedulerCoverageFlowRequirementWithSources[];
	coverageFlow: SchedulerCoverageFlowResult;
};

type CoalescedDeclaration = SchedulerCoverageFlowRequirementWithSources;

function strictestCoverageStrategy(
	left: CoverageStrategy,
	right: CoverageStrategy
): CoverageStrategy {
	if (left === right) return left;
	return 'record-and-lane';
}

function uniqueInOrder(values: (string | undefined)[]): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function uniqueNumbersInOrder(values: (number | undefined)[]): number[] {
	return [...new Set(values.filter((value): value is number => typeof value === 'number'))];
}

/**
 * Union of the wooIds declared across coalesced targeted declarations (mirrors the
 * uniqueInOrder union used for expectedRecordIds/currentRecordIds). The coalescing key
 * pins identical `ids`, but not every declarer necessarily carries the numeric channel —
 * first-without + later-with must coalesce to the declared wooIds, never to undefined
 * (an orders/products targeted task without wooIds fails the fetcher contract error).
 * Stays undefined only when NO declarer provided any (e.g. the customer:default sentinel).
 */
function mergedWooIds(
	existingWooIds: number[] | undefined,
	declarationWooIds: number[] | undefined
): number[] | undefined {
	const wooIds = uniqueNumbersInOrder([...(existingWooIds ?? []), ...(declarationWooIds ?? [])]);
	return wooIds.length > 0 ? wooIds : undefined;
}

function maxKnownTotal(values: (number | null | undefined)[]): number | null | undefined {
	const knownTotals = values.filter((value): value is number => typeof value === 'number');
	if (knownTotals.length > 0) return Math.max(...knownTotals);
	return values.some((value) => value === null) ? null : undefined;
}

function coalescingKey(declaration: QueryRequirementDeclaration): string {
	const idsPart =
		declaration.kind === 'targeted-records' ? [...(declaration.ids ?? [])].sort().join(',') : '';
	return [
		declaration.collection,
		declaration.queryKey,
		declaration.kind ?? 'query',
		declaration.policy.mode,
		idsPart,
	].join('|');
}

function toRequirement(declaration: QueryRequirementDeclaration): ReplicationRequirement {
	return {
		id: declaration.id,
		collection: declaration.collection,
		kind: declaration.kind ?? 'query',
		queryKey: declaration.queryKey,
		ids: declaration.ids,
		wooIds: declaration.wooIds,
		policy: declaration.policy,
	};
}

function mergeDeclaration(
	existing: CoalescedDeclaration,
	declaration: QueryRequirementDeclaration
): CoalescedDeclaration {
	const existingPriority = existing.requirement.policy.priority;
	const nextPolicy =
		declaration.policy.priority > existingPriority
			? declaration.policy
			: existing.requirement.policy;

	return {
		requirement: {
			...existing.requirement,
			id: existing.requirement.id,
			wooIds: mergedWooIds(existing.requirement.wooIds, declaration.wooIds),
			policy: nextPolicy,
		},
		coverageStrategy: strictestCoverageStrategy(
			existing.coverageStrategy,
			declaration.coverageStrategy
		),
		coverageState: existing.coverageState,
		expectedRecordIds: uniqueInOrder([
			...(existing.expectedRecordIds ?? []),
			...(declaration.expectedRecordIds ?? []),
		]),
		currentRecordIds: uniqueInOrder([
			...(existing.currentRecordIds ?? []),
			...(declaration.currentRecordIds ?? []),
		]),
		totalMatchingRecords: maxKnownTotal([
			existing.totalMatchingRecords,
			declaration.totalMatchingRecords,
		]),
		declaredBy: uniqueInOrder([...existing.declaredBy, declaration.componentId]),
	};
}

export function buildSchedulerCoverageRequirementsFromDeclarations(
	input: BuildSchedulerCoverageRequirementsInput
): SchedulerCoverageFlowRequirementWithSources[] {
	const byKey = new Map<string, CoalescedDeclaration>();

	for (const declaration of input.declarations) {
		const key = coalescingKey(declaration);
		const existing = byKey.get(key);

		if (existing) {
			byKey.set(key, mergeDeclaration(existing, declaration));
			continue;
		}

		byKey.set(key, {
			requirement: toRequirement(declaration),
			coverageStrategy: declaration.coverageStrategy,
			coverageState: input.coverageState,
			expectedRecordIds: declaration.expectedRecordIds,
			currentRecordIds: declaration.currentRecordIds,
			totalMatchingRecords: declaration.totalMatchingRecords,
			declaredBy: [declaration.componentId],
		});
	}

	return [...byKey.values()];
}

export async function runQueryRequirementFlow(
	input: QueryRequirementFlowInput
): Promise<QueryRequirementFlowResult> {
	const requirements = buildSchedulerCoverageRequirementsFromDeclarations({
		coverageState: input.coverageState,
		declarations: input.declarations,
	});
	const coverageFlow = await runSchedulerCoverageFlow({
		connectivity: input.connectivity,
		requirements,
		fetcher: input.fetcher,
	});

	return { requirements, coverageFlow };
}
