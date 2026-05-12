import { useRef, useState } from "react";
import {
  downloadDummySpreadsheet,
  downloadSpreadsheetTemplate,
} from "./data/createSpreadsheetTemplate";
import { parseSpreadsheet } from "./data/parseSpreadsheet";

function App() {
  const fileInputRef = useRef(null);
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState("");

  async function handleFileChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    try {
      const nextParsedData = await parseSpreadsheet(file);

      setParsedData(nextParsedData);
      setError("");
    } catch (parseError) {
      setParsedData(null);
      setError(parseError.message);
    } finally {
      event.target.value = "";
    }
  }

  const accounts = parsedData ? [...parsedData.accounts.values()] : [];
  const transactions = parsedData ? parsedData.transactions.slice(0, 25) : [];

  return (
    <main>
      <h1>Spreadsheet parser test</h1>

      <div>
        <button onClick={() => downloadSpreadsheetTemplate("Rumit Mehta")}>
          Download template
        </button>
        <button onClick={() => downloadDummySpreadsheet("Rumit Mehta Dummy")}>
          Download dummy spreadsheet
        </button>
        <button onClick={() => fileInputRef.current.click()}>
          Upload and parse spreadsheet
        </button>
      </div>

      <input
        accept=".xlsx"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
        hidden
      />

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

export default App;
