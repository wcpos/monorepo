/**
 *
 */
async function syncCollection(replicationState) {
	await replicationState.audit.run();
	replicationState.reSync();
}

export default syncCollection;
