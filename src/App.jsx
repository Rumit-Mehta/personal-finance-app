import { useEffect, useRef, useState } from "react";
import {
  downloadDummySpreadsheet,
  downloadSpreadsheetTemplate,
} from "./data/createSpreadsheetTemplate";
import { downloadUpdatedSpreadsheet } from "./data/updateSpreadsheet";
import {
  appDataFromFinanceData,
  createPfaVault,
  DuplicateImportError,
  financeDataFromAppData,
  mergeFinanceData,
  openPfaVault,
} from "./data/vault";
import { excelFileToFinanceData } from "./data/vault/adapters/excel";
import { monzoJsonFileToFinanceData } from "./data/vault/adapters/monzo";
import { FinanceBarChart } from "@/components/charts/FinanceBarChart";
import { FinanceLineChart } from "@/components/charts/FinanceLineChart";
import { FinancePieChart } from "@/components/charts/FinancePieChart";
import { BarChartInteractive } from "@/components/charts/BarChartInteractive";
import { Button } from "@/components/ui/button";

function App() {
  const fileInputRef = useRef(null);
  const monzoJsonInputRef = useRef(null);
  const pfaInputRef = useRef(null);
  const [parsedData, setParsedData] = useState(null);
  const [vaultData, setVaultData] = useState(null);
  const [vaultPassword, setVaultPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function handleThemeToggle() {
    setTheme((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark",
    );
  }

  async function handleFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      const nextVaultData = await excelFileToFinanceData(file);

      setVaultData(nextVaultData);
      setParsedData(appDataFromFinanceData(nextVaultData));
      setError("");
      setMessage("Loaded Excel data into the vault model.");
    } catch (parseError) {
      setParsedData(null);
      setVaultData(null);
      setError(parseError.message);
      setMessage("");
    } finally {
      event.target.value = "";
    }
  }

  async function handlePfaFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      requireVaultPassword();

      const nextVaultData = await openPfaVault(file, vaultPassword);

      setVaultData(nextVaultData);
      setParsedData(appDataFromFinanceData(nextVaultData));
      setError("");
      setMessage("Opened encrypted PFA vault.");
    } catch (openError) {
      setError(openError.message);
      setMessage("");
    } finally {
      event.target.value = "";
    }
  }

  async function handleMonzoJsonChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      const incomingVaultData = await monzoJsonFileToFinanceData(file);
      const nextVaultData = vaultData
        ? mergeFinanceData(
            vaultData,
            incomingVaultData,
            incomingVaultData.imports[0],
          )
        : incomingVaultData;

      setVaultData(nextVaultData);
      setParsedData(appDataFromFinanceData(nextVaultData));
      setError("");
      setMessage("Imported Monzo JSON into the vault model.");
    } catch (importError) {
      if (importError instanceof DuplicateImportError) {
        setMessage("That Monzo JSON file has already been imported.");
        setError("");
      } else {
        setError(importError.message);
        setMessage("");
      }
    } finally {
      event.target.value = "";
    }
  }

  async function handleDownloadPfa() {
    try {
      requireVaultPassword();

      const nextVaultData = currentVaultData();
      const buffer = await createPfaVault(nextVaultData, vaultPassword);

      downloadArrayBuffer(buffer, "my-finances.pfa", "application/octet-stream");
      setVaultData(nextVaultData);
      setError("");
      setMessage("Exported encrypted PFA vault.");
    } catch (downloadError) {
      setError(downloadError.message);
      setMessage("");
    }
  }

  async function handleDownloadExcel() {
    try {
      await downloadUpdatedSpreadsheet(appDataFromFinanceData(currentVaultData()));
      setError("");
      setMessage("Exported Excel workbook.");
    } catch (downloadError) {
      setError(downloadError.message);
      setMessage("");
    }
  }

  function currentVaultData() {
    if (vaultData) {
      return vaultData;
    }

    if (parsedData) {
      return financeDataFromAppData(parsedData);
    }

    throw new Error("Load Excel, Monzo JSON, or a PFA vault first.");
  }

  function requireVaultPassword() {
    if (!vaultPassword) {
      throw new Error("Enter a vault password first.");
    }
  }

  const accounts = parsedData ? [...parsedData.accounts.values()] : [];
  const accountNames = parsedData ? parsedData.accounts : new Map();
  const transactions = parsedData ? parsedData.transactions.slice(0, 25) : [];

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">
            Spreadsheet parser test
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Current accent changes with the active theme.
          </p>
        </div>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={handleThemeToggle}
          type="button"
        >
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => downloadSpreadsheetTemplate("Rumit Mehta")}>
          Download template
        </Button>
        <Button
          variant="secondary"
          onClick={() => downloadDummySpreadsheet("Rumit Mehta Dummy")}
        >
          Download dummy spreadsheet
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current.click()}>
          Upload Excel
        </Button>
        <Button
          variant="outline"
          onClick={() => monzoJsonInputRef.current.click()}
        >
          Import Monzo JSON
        </Button>
        <Button variant="outline" onClick={() => pfaInputRef.current.click()}>
          Open PFA
        </Button>
        <Button onClick={handleDownloadPfa} disabled={!parsedData}>
          Save PFA
        </Button>
        <Button
          variant="secondary"
          onClick={handleDownloadExcel}
          disabled={!parsedData}
        >
          Export Excel
        </Button>
      </div>

      <label className="mt-4 block max-w-sm text-sm">
        <span className="mb-1 block font-medium">Vault password</span>
        <input
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          onChange={(event) => setVaultPassword(event.target.value)}
          type="password"
          value={vaultPassword}
        />
      </label>

      <input
        accept=".xlsx"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
        hidden
      />
      <input
        accept=".pfa"
        onChange={handlePfaFileChange}
        ref={pfaInputRef}
        type="file"
        hidden
      />
      <input
        accept=".json"
        onChange={handleMonzoJsonChange}
        ref={monzoJsonInputRef}
        type="file"
        hidden
      />

      <section>
        <h2>Charts</h2>
        <div className="grid gap-4">
          {/* <FinancePieChart />
          <FinanceBarChart />
          <FinanceLineChart /> */}
          <BarChartInteractive />
        </div>
      </section>

      {message && <p>{message}</p>}
      {error && <p>{error}</p>}

      {parsedData && (
        <>
          <section>
            <h2>User</h2>
            <dl>
              <dt>Name</dt>
              <dd>{parsedData.user.fullName || "Unknown"}</dd>
              <dt>Accounts</dt>
              <dd>{parsedData.accounts.size}</dd>
              <dt>Transactions</dt>
              <dd>{parsedData.transactions.length}</dd>
              <dt>Net worth</dt>
              <dd>{formatCurrency(parsedData.user.netWorth)}</dd>
            </dl>
          </section>

          <section>
            <h2>Accounts</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Institution</th>
                  <th>Kind</th>
                  <th>Parent</th>
                  <th>Balance</th>
                  <th>Transactions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.type}</td>
                    <td>{account.institution}</td>
                    <td>{account.accountKind}</td>
                    <td>
                      {account.parentAccountId
                        ? accountNames.get(account.parentAccountId)?.name ??
                          account.parentAccountId
                        : ""}
                    </td>
                    <td>{formatCurrency(account.balance)}</td>
                    <td>{account.transactionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Transactions Preview</h2>
            <p>Showing first {transactions.length} transactions.</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Tag</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.description}</td>
                    <td>{transaction.account}</td>
                    <td>{transaction.category}</td>
                    <td>{transaction.tag}</td>
                    <td>{formatCurrency(transaction.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB").format(value);
}

function downloadArrayBuffer(buffer, fileName, type) {
  const blob = new Blob([buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

export default App;
