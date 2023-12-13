# Query and Replication library for WooCommerce POS

## Architectural Overview
1. **RxDB Collections for Each Endpoint**:
- Each [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/) endpoint corresponds to an [RxDB](https://rxdb.info/) collection (e.g., 'products').
- Collections are initialized with schemas that reflect the data structure of their respective endpoints.
2. **ReplicationState Management**:
- Manages synchronization between the local RxDB database and the WooCommerce REST API.
- Key Responsibilities:
	- Maintaining a list of all remote record IDs.
	- Periodically fetching records not present locally.
	- Fetching recently modified records.
	- On-demand fetching for immediate user requirements.
- Uses efficient, paginated API calls to avoid overloading the server.
- Implements conflict resolution strategies for data consistency.
3. **QueryState Management**:
- Each user query has a corresponding QueryState.
- Manages emitting query results from the local RxDB database.
- Allows multiple, simultaneous queries per collection.
- Inspired by ReactQuery: Each QueryState has a unique identifier.
- Decoupled from ReplicationState, focused solely on querying the local database.
4. **Sync Strategies**:
- Incremental Sync: Regularly fetches new or changed data based on remote IDs.
- On-Demand Sync: Triggered by user actions, e.g., searching for a product.
- Background Sync: Continuously updates the local database without hindering user experience.
- Full Sync: Occasionally, to ensure complete data consistency.
5. **Mutation Management**:
- Tracks local changes that need to be pushed to the server.
- Ensures data consistency between local changes and server updates.
6. **Conflict Resolution**:
- Handles conflicts that may arise during synchronization.
- Implements strategies like 'server wins', 'client wins', or more sophisticated merge logic.
7. **Error Handling and Logging**:
- Robust error handling to manage network issues, API limits, etc.
- Detailed logging for debugging and monitoring sync operations.
