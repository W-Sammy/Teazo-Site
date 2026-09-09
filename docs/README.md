# TEAZO documentation

Three documents. Start with the one that matches what you are doing.

| Document | Who it is for | What it covers |
|---|---|---|
| **[DEV-GUIDE.md](./DEV-GUIDE.md)** | the whole team | Getting a database running on your laptop, how to query it, how media is stored, how auth works, the table reference. **Start here if you are building a feature.** |
| **[OPERATIONS.md](./OPERATIONS.md)** | Juan | Creating the Cloudflare resources, secrets, migrations, deploying the proxy Worker, go-live, rollback, cost. Nobody else runs these commands. |
| **[DATA-MODEL.md](./DATA-MODEL.md)** | anyone curious | *Why* the schema looks like this — the Square boundary, what was deliberately cut, the reasoning behind the odd-looking columns. |

**The source of truth for the schema is
[`teazo-site/migrations/0001_init.sql`](../teazo-site/migrations/0001_init.sql).**
If a document disagrees with that file, the file wins — say so and it gets fixed.

---

### The 60-second version

The app runs on **Vercel**. The database is **Cloudflare D1**, reached through a
small proxy Worker because D1 has no binding on Vercel. Media lives in
**Cloudflare R2** and is served from a custom domain. **Square** owns the product
catalog; we cache it and never treat our copy as authoritative.

Nothing is deployed yet, and that does not block you: every developer gets their
own local database and can build against it today. See DEV-GUIDE.md §1.
