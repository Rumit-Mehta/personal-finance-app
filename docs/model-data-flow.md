# Model And Data Flow Graph

This repo has three runtime class models in `src/models`:

- `User`
- `Account`
- `Transaction`

The canonical persisted model is the normalized finance data shape in
`src/data/vault/financeData.js`. It is what `.pfa`, Excel, Monzo JSON, and CSV
imports are converted into before the app renders data.

## Runtime Model Graph

```mermaid
classDiagram
  direction LR

  class User {
    firstName
    lastName
    age
    accounts: Map~Account~
    investments: Map~id,value~
    debts: Map~id,value~
    fullName
    totalAccountBalance
    totalInvestments
    totalDebts
    netWorth
  }

  class Account {
    id
    name
    type
    institution
    accountKind
    parentAccountId
    openingBalance
    manualBalance
    currency
    transactions: Transaction[]
    calculatedBalance
    balance
    isVirtual
    isActual
    transactionCount
  }

  class Transaction {
    id
    date
    description
    amount
    category
    tag
    account
    merchant
    notes
    isIncome
    isExpense
    absoluteAmount
  }

  class InvestmentValue {
    id
    currentValue
  }

  class DebtValue {
    id
    currentValue
  }

  User "1" --> "*" Account : accounts map
  User "1" --> "*" InvestmentValue : investments map
  User "1" --> "*" DebtValue : debts map
  Account "1" --> "*" Transaction : addTransaction()
  Account "0..1" --> "*" Account : parentAccountId
  Transaction "*" --> "1" Account : account id
```

## Persisted Finance Data Graph

```mermaid
erDiagram
  FINANCE_DATA ||--|| USER : has
  FINANCE_DATA ||--o{ ACCOUNT : stores
  FINANCE_DATA ||--o{ BALANCE : stores
  FINANCE_DATA ||--o{ TRANSACTION : stores
  FINANCE_DATA ||--o{ TAG : stores
  FINANCE_DATA ||--o{ INVESTMENT : stores
  FINANCE_DATA ||--o{ DEBT : stores
  FINANCE_DATA ||--o{ VALUE_HISTORY : stores
  FINANCE_DATA ||--o{ IMPORT_RECORD : stores
  FINANCE_DATA ||--o{ IMPORT_RULE : stores

  ACCOUNT ||--o{ ACCOUNT : parentAccountId
  ACCOUNT ||--o{ TRANSACTION : account
  ACCOUNT ||--o{ BALANCE : accountId
  TAG ||--o{ TRANSACTION : tag
  INVESTMENT ||--o{ VALUE_HISTORY : entityId_when_investment
  DEBT ||--o{ VALUE_HISTORY : entityId_when_debt
  TRANSACTION ||--o{ TRANSACTION : duplicateOf
  IMPORT_RECORD }o--o{ ACCOUNT : accountIds
  IMPORT_RULE ||--o{ TRANSACTION : sets_category_tag_merchant_notes_during_import

  FINANCE_DATA {
    number schemaVersion
    object metadata
  }

  USER {
    string firstName
    string lastName
    string age
  }

  ACCOUNT {
    string id
    string name
    string type
    string institution
    string accountKind
    string parentAccountId
    string currency
    number openingBalance
    number manualBalance
    string sourceProvider
    string sourceId
  }

  BALANCE {
    string id
    string accountId
    datetime date
    number balance
    number totalBalance
    number spendToday
    string currency
    string sourceProvider
    string sourceId
  }

  TRANSACTION {
    string id
    string account
    date date
    string description
    number amount
    string category
    string tag
    string merchant
    string notes
    string sourceProvider
    string sourceType
    string sourceId
    string fingerprint
    boolean possibleDuplicate
    string duplicateOf
  }

  TAG {
    string id
    string name
    string description
  }

  INVESTMENT {
    string id
    string name
    string type
    string provider
    string currency
    number currentValue
  }

  DEBT {
    string id
    string name
    string type
    string provider
    string currency
    number currentValue
  }

  VALUE_HISTORY {
    string id
    string entityType
    string entityId
    date date
    number value
  }

  IMPORT_RECORD {
    string id
    string sourceType
    string fileHash
    string fileName
    string provider
    string accountIds
    number transactionCount
    datetime importedAt
  }

  IMPORT_RULE {
    string id
    string name
    boolean enabled
    string sourceType
    string sourceProvider
    number order
    object match
    object set
  }
```

## End-To-End Data Flow

```mermaid
flowchart LR
  subgraph Inputs
    Excel["Excel workbook (.xlsx)"]
    Csv["Bank CSV import"]
    MonzoJson["Monzo JSON export"]
    PfaOpen["Encrypted PFA vault (.pfa)"]
  end

  subgraph ImportAndNormalize["Import and normalize"]
    ParseSpreadsheet["parseSpreadsheet()"]
    ExcelAdapter["excelFileToFinanceData()"]
    ParseCsv["parseImportFile()"]
    CsvAdapter["Monzo CSV adapter"]
    Rules["applyRulesToImportBatch()"]
    AssignAccount["assignImportBatchAccount()"]
    EditedImport["financeDataFromEditedImport()"]
    MonzoAdapter["monzoJsonFileToFinanceData()"]
    OpenVault["openPfaVault()"]
    Normalize["normalizeFinanceData()"]
    Merge["mergeFinanceData()"]
  end

  subgraph CanonicalStore["Canonical store"]
    FinanceData["FinanceData JSON model"]
    VaultParts["metadata/user/accounts/balances/transactions/tags/investments/debts/valueHistory/imports/importRules"]
  end

  subgraph RuntimeApp["Runtime app model"]
    AppData["appDataFromFinanceData()"]
    UserModel["User"]
    AccountModels["Map<Account>"]
    TransactionModels["Transaction[]"]
    Ui["App.jsx tables, preview, net worth"]
  end

  subgraph Outputs
    CreateVault["createPfaVault()"]
    ExportExcel["downloadUpdatedSpreadsheet()"]
    PfaOut["Encrypted PFA vault"]
    ExcelOut["Excel workbook"]
  end

  Excel --> ParseSpreadsheet --> ExcelAdapter --> Normalize
  Csv --> ParseCsv --> CsvAdapter --> Rules --> AssignAccount --> EditedImport --> Normalize
  MonzoJson --> MonzoAdapter --> Normalize
  PfaOpen --> OpenVault --> Normalize

  Normalize --> Merge
  Merge --> FinanceData
  Normalize --> FinanceData
  FinanceData --> VaultParts

  FinanceData --> AppData
  AppData --> UserModel
  AppData --> AccountModels
  AppData --> TransactionModels
  UserModel --> Ui
  AccountModels --> Ui
  TransactionModels --> Ui

  FinanceData --> CreateVault --> PfaOut
  FinanceData --> AppData --> ExportExcel --> ExcelOut
```

## Key Flow Notes

- `FinanceData` is the canonical model. It is normalized and validated before use.
- `appDataFromFinanceData()` turns canonical records into runtime `User`,
  `Account`, and `Transaction` instances.
- `financeDataFromAppData()` turns runtime data back into normalized records.
- `Transaction.account` must reference an existing `Account.id`.
- `Account.parentAccountId` creates account hierarchy, such as Monzo pots under a
  main account.
- `Transaction.tag` is the spreadsheet `tagId` field and points to `Tag.id`
  when tags are present.
- `Balance.accountId` points to `Account.id` and captures point-in-time balances,
  mainly from Monzo JSON imports.
- `ValueHistory.entityType` plus `entityId` points at investments or debts in the
  current spreadsheet/vault model.
- `ImportRecord.fileHash` is used to detect duplicate imports.
- `ImportRule` is stored in the vault and applies only during staged CSV import;
  it can set `category`, `tag`, `merchant`, and `notes`.
