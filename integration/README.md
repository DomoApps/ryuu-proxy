# ryuu-proxy — Integration Test Harness

These tests exercise the full proxy pipeline against a **live Domo instance** using a small
sample sales dataset. They exist to catch regressions that unit tests (with mocked
`ryuu-client`) cannot — particularly auth and request-forwarding issues like
[#88](https://github.com/DomoApps/ryuu-proxy/issues/88).

---

## Prerequisites

| Requirement          | Why                                          |
| -------------------- | -------------------------------------------- |
| Node.js ≥ 18         | Native `fetch` required by `ryuu-client` v5  |
| `pnpm`               | Package manager for this repo                |
| `domo` CLI logged in | `ryuu-proxy` reads auth from `~/ryuu/*.json` |
| A Domo test instance | Where the dataset and card live              |

Install dependencies (including `express`, which is a devDependency only used here):

```bash
pnpm install
```

---

## One-time setup

### 1 Log in to your Domo instance

```bash
domo login
```

This writes credentials to `~/ryuu/<instance>.json`, which `ryuu-proxy` picks up at run time.
You must log in to the **same instance** you'll put in `DOMO_INSTANCE` below.

---

### 2 Upload the test dataset

The sample data lives at `integration/fixtures/sales.csv`. It has 10 rows and 5 columns
(Date, Product, Region, Revenue, Units) — small enough to be fast, realistic enough to test
aggregations.

**Option A — Domo web UI:**

1. Open your Domo instance → **Data Center** → **+** (Add Dataset).
2. Choose **File Upload** and upload `integration/fixtures/sales.csv`.
3. Name the dataset `ryuu-proxy Integration Test — Sales`.
4. After upload, copy the UUID from the URL bar — this is `DOMO_DATASET_ID`.

**Option B — Domo CLI** (if your org has the `domo data` commands available):

```bash
# Creates the dataset and prints its ID
domo dataset create -t "ryuu-proxy Integration Test — Sales" integration/fixtures/sales.csv
```

---

### 3 Get a Proxy ID from a published Domo card

The `proxyId` ties the local dev environment to a specific card/app instance on Domo. It
appears as the subdomain UUID in the card's embed URL.

1. Open any card in your Domo instance (or create one that uses the sales dataset).
2. Card overflow menu → **Share** → **Embed**.
3. The embed URL looks like:

   ```
   https://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.domoapps.prod3.domo.com
   ```

   The UUID subdomain is your `DOMO_PROXY_ID`.

4. The card's design/app ID (`DOMO_ASSET_ID`) appears in the Domo UI URL when you open the card
   edit view. If you already have a `proxyId`, `DOMO_ASSET_ID` can be left empty.

---

### 4 Configure the environment file

```bash
cp integration/.env.example integration/.env
```

Fill in all four required values:

```dotenv
DOMO_INSTANCE=your-instance.domo.com
DOMO_DATASET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DOMO_PROXY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DOMO_ASSET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

`integration/.env` is listed in `.gitignore` — it will never be committed.

---

## Running the tests

```bash
pnpm run test:integration
```

The runner:

1. Loads `integration/.env` automatically via `integration/setup.ts`.
2. Starts a local Express server on port `4321` (override with `INTEGRATION_PORT`).
3. Instantiates `new Proxy({ manifest })` — the same pattern as a real app — and mounts
   `proxy.express()` as middleware.
4. Waits 2 s for the proxy to resolve the domain URL from `getEnvironment`.
5. Runs all tests and closes the server.

If any required env var is missing, the entire suite is **skipped** with a warning rather
than failing with a cryptic error.

---

## What the tests cover

| Test               | Endpoint                       | Description                                   |
| ------------------ | ------------------------------ | --------------------------------------------- |
| Dataset rows       | `GET /data/v1/sales`           | Fetches all rows; asserts shape               |
| SQL `SELECT *`     | `POST /sql/v1/sales`           | Basic query with LIMIT                        |
| SQL aggregation    | `POST /sql/v1/sales`           | `GROUP BY` with `SUM`                         |
| **#88 regression** | `POST /sql/v1/sales`           | Sends explicit `content-length`; verifies 200 |
| API passthrough    | `GET /api/content/v2/users/me` | Verifies `/api/` route forwarding             |
| Non-Domo URL       | `GET /some/local/path`         | Proxy calls `next()`; Express returns 404     |

The regression test (`#88`) is the most important: it confirms that forwarding
`content-length` alongside a reconstructed string body no longer produces an
HTTP/1.1-invalid request that Domo rejects with 500.

---

## Troubleshooting

**All tests skipped with "required env vars not set"**
→ Check that `integration/.env` exists and that all four `DOMO_*` vars are filled in.

**`Not authenticated` error on startup**
→ Run `domo login` for the instance specified in `DOMO_INSTANCE`.

**500 from Domo on SQL tests**
→ Confirm `DOMO_PROXY_ID` is correct (UUID from the card's embed URL, not the card ID).
→ Confirm the dataset alias `sales` is mapped in the manifest — the test manifest is built
from `DOMO_DATASET_ID` automatically.

**Port already in use**
→ Set `INTEGRATION_PORT=4322` (or any free port) in `integration/.env`.

**Timeout on `beforeAll`**
→ The `getEnvironment` call can take several seconds on slow instances. The hook allows
60 s. If it still times out, check network connectivity to your Domo instance.
