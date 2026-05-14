# PFA Vault

`.pfa` is the canonical local finance file for the app. It is a zip with:

- `manifest.json`: unencrypted format and crypto metadata only.
- `vault.bin`: encrypted inner zip payload.

The decrypted inner zip contains normalized JSON:

- `metadata.json`
- `user.json`
- `accounts.json`
- `balances.json`
- `transactions.json`
- `tags.json`
- `investments.json`
- `debts.json`
- `valueHistory.json`
- `imports.json`

## Public API

```js
import {
  createPfaVault,
  openPfaVault,
  mergeFinanceData,
  validateFinanceData,
} from "./src/data/vault";
```

- `createPfaVault(financeData, password)` returns an encrypted `.pfa` `ArrayBuffer`.
- `openPfaVault(fileOrBuffer, password)` decrypts and returns normalized finance data.
- `mergeFinanceData(existingData, incomingData, importRecord)` merges new imports and detects duplicate source files.
- `validateFinanceData(data)` throws if the normalized finance data shape is invalid.

Excel remains an import/export format. Use `adapters/excel.js` to convert between Excel and finance data. Monzo JSON remains personal/local use only. Use `adapters/monzo.js` to convert saved Monzo JSON into finance data.
