import { planQueryTotalRequest, type QueryTotalCacheEntry, type QueryTotalConnectivity, type QueryTotalRequestParams, type QueryTotalWooRequest } from './query-total-requests';
import type { QueryTotalDiscoveryDecision } from './query-total-discovery';

export type QueryTotalRequestLifecycleAction =
  | 'skip-not-needed'
  | 'use-cached-total'
  | 'wait-for-owner'
  | 'wait-for-retry'
  | 'skip-offline'
  | 'claim-request'
  | 'take-over-request';

export type QueryTotalRequestStateStatus = 'in-flight' | 'failed';

export type QueryTotalRequestOwnerStatus =
  | 'not-needed'
  | 'cache-hit'
  | 'not-claimed'
  | 'unowned'
  | 'owned-by-current-tab'
  | 'owned-by-other-tab'
  | 'expired-owner';

export type QueryTotalRequestRetryStatus =
  | 'not-needed'
  | 'not-applicable'
  | 'backoff-active'
  | 'retry-ready';

export type QueryTotalRequestState = {
  queryKey: string;
  status: QueryTotalRequestStateStatus;
  ownerId: string | null;
  claimedUntilMs: number | null;
  attempt: number;
  retryAfterMs: number | null;
  updatedAtMs: number;
  request: QueryTotalWooRequest | null;
};

export type QueryTotalRequestLifecycleInput = {
  discovery: QueryTotalDiscoveryDecision;
  connectivity: QueryTotalConnectivity;
  nowMs: number;
  ownerId: string;
  endpoint: string;
  filters: Record<string, string | number | boolean | null | undefined>;
  cacheEntries: QueryTotalCacheEntry[];
  requestStates: QueryTotalRequestState[];
};

export function sameQueryTotalRequestMetadata(left: QueryTotalWooRequest | null, right: QueryTotalWooRequest | null): boolean {
  if (left === null || right === null) return left === right;
  const leftParamKeys = Object.keys(left.params).sort();
  const rightParamKeys = Object.keys(right.params).sort();
  return left.queryKey === right.queryKey
    && left.method === right.method
    && left.endpoint === right.endpoint
    && left.totalHeader === right.totalHeader
    && leftParamKeys.length === rightParamKeys.length
    && leftParamKeys.every((key, index) => key === rightParamKeys[index] && left.params[key] === right.params[key]);
}

export function sameQueryTotalRequestState(left: QueryTotalRequestState, right: QueryTotalRequestState): boolean {
  return left.queryKey === right.queryKey
    && left.status === right.status
    && left.ownerId === right.ownerId
    && left.claimedUntilMs === right.claimedUntilMs
    && left.attempt === right.attempt
    && left.retryAfterMs === right.retryAfterMs
    && left.updatedAtMs === right.updatedAtMs
    && sameQueryTotalRequestMetadata(left.request, right.request);
}

export type QueryTotalRequestLifecycleDecision = {
  queryKey: string;
  action: QueryTotalRequestLifecycleAction;
  reason: string;
  totalMatchingRecords: number | null;
  request: QueryTotalWooRequest | null;
  ownerStatus: QueryTotalRequestOwnerStatus;
  retryStatus: QueryTotalRequestRetryStatus;
  nextAttempt: number | null;
  claimedUntilMs: number | null;
  retryAfterMs: number | null;
  requestParams: QueryTotalRequestParams | null;
};

function findLatestState(states: QueryTotalRequestState[], queryKey: string): QueryTotalRequestState | undefined {
  return states
    .filter((state) => state.queryKey === queryKey)
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)[0];
}

function fromBaseDecision(
  input: QueryTotalRequestLifecycleInput,
  ownerStatus: QueryTotalRequestOwnerStatus,
  retryStatus: QueryTotalRequestRetryStatus,
): QueryTotalRequestLifecycleDecision {
  const baseDecision = planQueryTotalRequest({
    discovery: input.discovery,
    connectivity: input.connectivity,
    nowMs: input.nowMs,
    endpoint: input.endpoint,
    filters: input.filters,
    cacheEntries: input.cacheEntries,
    inFlightQueryKeys: [],
  });

  return {
    queryKey: baseDecision.queryKey,
    action: baseDecision.action as QueryTotalRequestLifecycleAction,
    reason: baseDecision.reason,
    totalMatchingRecords: baseDecision.totalMatchingRecords,
    request: baseDecision.request,
    ownerStatus,
    retryStatus,
    nextAttempt: null,
    claimedUntilMs: null,
    retryAfterMs: null,
    requestParams: baseDecision.request?.params ?? null,
  };
}

export function planQueryTotalRequestLifecycle(input: QueryTotalRequestLifecycleInput): QueryTotalRequestLifecycleDecision {
  const baseDecision = planQueryTotalRequest({
    discovery: input.discovery,
    connectivity: input.connectivity,
    nowMs: input.nowMs,
    endpoint: input.endpoint,
    filters: input.filters,
    cacheEntries: input.cacheEntries,
    inFlightQueryKeys: [],
  });

  if (baseDecision.action === 'skip-not-needed') {
    return fromBaseDecision(input, 'not-needed', 'not-needed');
  }

  if (baseDecision.action === 'use-cached-total') {
    return fromBaseDecision(input, 'cache-hit', 'not-applicable');
  }

  if (baseDecision.action === 'skip-offline') {
    return fromBaseDecision(input, 'not-claimed', 'not-applicable');
  }

  const existingState = findLatestState(input.requestStates, input.discovery.queryKey);
  if (existingState?.status === 'in-flight') {
    if (existingState.claimedUntilMs !== null && existingState.claimedUntilMs > input.nowMs) {
      return {
        queryKey: baseDecision.queryKey,
        action: 'wait-for-owner',
        reason: existingState.ownerId === input.ownerId
          ? 'current tab already owns this query-total request lease'
          : 'another tab owns an active query-total request lease',
        totalMatchingRecords: null,
        request: null,
        ownerStatus: existingState.ownerId === input.ownerId ? 'owned-by-current-tab' : 'owned-by-other-tab',
        retryStatus: 'not-applicable',
        nextAttempt: null,
        claimedUntilMs: existingState.claimedUntilMs,
        retryAfterMs: null,
        requestParams: null,
      };
    }

    return {
      queryKey: baseDecision.queryKey,
      action: 'take-over-request',
      reason: 'previous query-total request owner lease expired and can be taken over',
      totalMatchingRecords: null,
      request: baseDecision.request,
      ownerStatus: 'expired-owner',
      retryStatus: 'not-applicable',
      nextAttempt: existingState.attempt + 1,
      claimedUntilMs: existingState.claimedUntilMs,
      retryAfterMs: null,
      requestParams: baseDecision.request?.params ?? null,
    };
  }

  if (existingState?.status === 'failed') {
    if (existingState.retryAfterMs !== null && existingState.retryAfterMs > input.nowMs) {
      return {
        queryKey: baseDecision.queryKey,
        action: 'wait-for-retry',
        reason: 'failed query-total request is still inside retry backoff',
        totalMatchingRecords: null,
        request: null,
        ownerStatus: 'unowned',
        retryStatus: 'backoff-active',
        nextAttempt: null,
        claimedUntilMs: null,
        retryAfterMs: existingState.retryAfterMs,
        requestParams: null,
      };
    }

    return {
      queryKey: baseDecision.queryKey,
      action: 'claim-request',
      reason: 'failed query-total request retry backoff has elapsed and can be claimed',
      totalMatchingRecords: null,
      request: baseDecision.request,
      ownerStatus: 'unowned',
      retryStatus: 'retry-ready',
      nextAttempt: existingState.attempt + 1,
      claimedUntilMs: null,
      retryAfterMs: existingState.retryAfterMs,
      requestParams: baseDecision.request?.params ?? null,
    };
  }

  return {
    queryKey: baseDecision.queryKey,
    action: 'claim-request',
    reason: 'query-total request has no active owner or retry backoff and can be claimed',
    totalMatchingRecords: null,
    request: baseDecision.request,
    ownerStatus: 'unowned',
    retryStatus: 'not-applicable',
    nextAttempt: 1,
    claimedUntilMs: null,
    retryAfterMs: null,
    requestParams: baseDecision.request?.params ?? null,
  };
}
