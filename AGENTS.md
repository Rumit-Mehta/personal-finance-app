# AGENTS.md

## Project Context

This is a personal finance app built with React, Vite, and local data import/export utilities.

The project is moving toward a privacy-first, user-owned data model:

- `.pfa` is the canonical finance vault file.
- Excel is a human-facing import/export format, not the source of truth.
- Bank statements, broker statements, Excel files, Monzo JSON, and future import sources should normalize into the shared finance data model.
- The app should be able to open, merge, analyze, and export a user's financial history without server-side storage.

## Privacy And Data Rules

Financial data is sensitive. Default to local-first behavior.

- Do not add server-side storage for raw financial data unless explicitly requested.
- Do not upload `.pfa`, Excel, statement, transaction, balance, account, pot, or investment data to a server in customer-facing flows.
- Do not store PFA passwords.
- Do not store derived encryption keys.
- Do not persist decrypted vault data in `localStorage`, `sessionStorage`, IndexedDB, logs, analytics, or URLs unless explicitly requested and encrypted.
- Decrypted finance data should live only in app memory during the active session.
- Avoid third-party scripts or analytics on screens that handle financial files.
- Keep generated financial data files, OAuth tokens, and local secrets out of git.

## Canonical PFA Vault

The PFA implementation lives under `src/data/vault/`.

Public API:

- `createPfaVault(financeData, password)`
- `openPfaVault(fileOrBuffer, password)`
- `mergeFinanceData(existingData, incomingData, importRecord)`
- `validateFinanceData(data)`

PFA file shape:

- Outer `.pfa` file is a zip.
- `manifest.json` is unencrypted and contains only format and crypto metadata.
- `vault.bin` contains the encrypted inner zip payload.
- The decrypted inner zip contains normalized JSON files such as accounts, balances, transactions, categories/tags, imports, and metadata.

Encryption rules:

- Use Web Crypto.
- Use PBKDF2-SHA-256 for password-based key derivation.
- Use AES-256-GCM for encryption/decryption.
- Use a random salt and IV per vault file.
- Do not change crypto parameters casually; preserve backward compatibility through manifest versioning.

## Data Model And Imports

Normalize all input sources into the finance data model before the app uses them.

Current adapters:

- Excel adapter: `src/data/vault/adapters/excel.js`
- Monzo JSON adapter: `src/data/vault/adapters/monzo.js`
- Import pipeline: `src/data/imports/pipeline.js`
- Monzo CSV adapter: `src/data/imports/adapters/monzoCsv.js`
- Trading 212 PDF adapter: `src/data/imports/adapters/trading212Pdf.js`

Browser import flow:

- The main UI uses one `Import File` control for `.xlsx`, `.csv`, `.pdf`, and `.json` files.
- `.pfa` vault open/save stays separate because it involves password-based encryption and decryption.
- `parseImportFile(file)` in `src/data/imports/pipeline.js` handles CSV/PDF import staging.
- CSV files are parsed with `src/data/imports/csv.js`, then matched to an adapter through `src/data/imports/adapters/index.js`.
- PDF files are read locally in browser memory by `src/data/imports/pdf.js` using `pdfjs-dist`, then matched to an adapter through `src/data/imports/adapters/index.js`.
- Trading 212 PDFs are detected by `trading212PdfAdapter.detect()` from extracted statement text markers, then normalized into accounts, balance snapshots, transactions, investments, and value history.
- Do not upload PDFs or extracted statement text; statement parsing must remain local-only.

Expected flow:

```text
input source
  -> adapter
  -> normalized finance data
  -> mergeFinanceData
  -> app model/UI
  -> createPfaVault or export format
```

Deduping rules:

- If a source transaction ID exists, use provider/source ID as the stable key.
- If importing the same source file again, detect it with the stored file hash.
- If no source ID exists, use a transaction fingerprint and flag likely duplicates instead of silently deleting ambiguous transactions.

## Excel

Excel is supported for humans, not as the app's canonical storage layer.

- Existing spreadsheet parsing lives in `src/data/parseSpreadsheet.js`.
- Existing spreadsheet export lives in `src/data/updateSpreadsheet.js`.
- Template and dummy spreadsheet download buttons were removed; do not reintroduce template/dummy generation unless explicitly requested.
- Do not route internal app state through Excel if normalized finance data is available.
- Keep Excel compatibility focused on import/export and manual inspection.

## Trading 212 Statements

Trading 212 monthly statement PDF import is local-only and browser-based.

- `src/data/imports/pdf.js` extracts ordered text from uploaded PDFs without sending data off-device.
- `src/data/imports/adapters/trading212Pdf.js` parses statement metadata, account IDs, overview totals, cash breakdowns, transactions, trades, dividends, and open positions.
- Trading 212 accounts become actual accounts with balance snapshots based on total account value, not cash-only balance.
- Open positions are also stored as investments plus month-end `valueHistory`, using account and ISIN based IDs.
- Trading 212 investments are excluded from the app summary/net-worth aggregation when the Trading 212 account balance already includes the same holdings, to avoid double counting.
- Preserve raw statement details such as order IDs, ISINs, execution prices, FX, fees, venues, QMMF details, and parser warnings in notes where the current schema has no dedicated field.

## Bank Integrations

Bank API connectors belong under `integrations/banks/`.

Current integration:

- Monzo: `integrations/banks/monzo/`

Important Monzo boundary:

- The Monzo Developer API integration is for personal/local use only.
- Do not treat the Monzo Developer API as a commercial/customer bank connection.
- Monzo OAuth secrets and tokens must stay local and out of git.
- `integrations/banks/monzo/.env`, `data/*.json`, and `data/*.pfa` are ignored.

Commercial bank access should use an appropriate Open Banking/AISP route or aggregator, but keep customer-facing raw data processing local-first unless explicitly directed otherwise.

## Frontend Guidance

The app should present the actual finance workspace, not a marketing page.

- Keep controls functional and direct.
- Avoid server-backed assumptions for local file flows.
- Do not add UI copy that implies the app stores customer data remotely.
- When adding import/export controls, make it clear which file is canonical (`.pfa`) and which formats are import/export only.

## Commands

Use these checks before handing off code changes:

```sh
npm run test
npm run lint
npm run build
```

Useful Monzo personal-use commands:

```sh
npm run monzo:auth
npm run monzo:fetch
PFA_PASSWORD="choose-a-strong-password" npm run monzo:pfa
```

## Git And Generated Files

Do not commit:

- `.env` files
- OAuth tokens
- fetched bank JSON
- downloaded or extracted bank/broker statements
- generated `.pfa` vaults
- build output
- real customer or personal financial data

Before committing, check:

```sh
git status --short
git status --ignored --short
```
