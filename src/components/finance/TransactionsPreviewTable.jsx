import { formatCurrency, formatDate } from "@/utils/formatters";

export function TransactionsPreviewTable({ transactions }) {
  return (
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
  );
}
