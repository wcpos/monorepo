This should be abstracted, perhaps as part of the QueryProvider config?

We have two formats for querying data:

- one for the local rxdb database (mongo like syntax)
- one for the WC REST API which has it's own quirks

For example:

Query products by category 19 in rxdb, ordered by name.

```
{
	selector: {
		categories: {
			$elemMatch: 19
		}
	},
	sortBy: 'name'
}

```

Query products by category 19 in WC REST API, ordered by name.

```
queryParams = {
	category: 19,
	orderby: 'title'
}
```
