export interface RxDBRestApiReplicationQueryBuilderResponseObject {
	query: string;
	variables: any;
}

export type RxDBRestApiReplicationQueryBuilderResponse =
	| RxDBRestApiReplicationQueryBuilderResponseObject
	| Promise<RxDBRestApiReplicationQueryBuilderResponseObject>;

export type RxDBRestApiReplicationQueryBuilder = (
	doc: any
) => RxDBRestApiReplicationQueryBuilderResponse;

export interface RestApiSyncPullOptions {
	queryBuilder: RxDBRestApiReplicationQueryBuilder;
	modifier?: (doc: any) => Promise<any> | any;
	query?: any;
}

export interface RestApiSyncPushOptions {
	queryBuilder: RxDBRestApiReplicationQueryBuilder;
	modifier?: (doc: any) => Promise<any> | any;
	batchSize?: number;
	query?: any;
}

export type SyncOptionsRestApi = {
	url: string;
	auth?: { [k: string]: string }; // send with all requests to the endpoint
	waitForLeadership?: boolean; // default=true
	pull?: RestApiSyncPullOptions;
	push?: RestApiSyncPushOptions;
	deletedFlag: string;
	live?: boolean; // default=false
	liveInterval?: number; // time in ms
	retryTime?: number; // time in ms
	autoStart?: boolean; // if this is false, the replication does nothing at start
	syncRevisions?: boolean;
};
