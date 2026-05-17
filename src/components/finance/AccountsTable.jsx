import { formatCurrency } from "@/utils/formatters";

export function AccountsTable({ accountNames, accounts }) {
  return (
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
            <th>Snapshots</th>
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
                  ? (accountNames.get(account.parentAccountId)?.name ??
                    account.parentAccountId)
                  : ""}
              </td>
              <td>{formatCurrency(account.balance)}</td>
              <td>{account.balanceSnapshotCount}</td>
              <td>{account.transactionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
