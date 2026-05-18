import { formatCurrency } from "@/utils/formatters";

export function UserSummarySection({ importRules, parsedData }) {
  return (
    <section>
      <h2>User</h2>
      <dl>
        <dt>Name</dt>
        <dd>{parsedData.user.fullName || "Unknown"}</dd>
        <dt>Accounts</dt>
        <dd>{parsedData.accounts.size}</dd>
        <dt>Transactions</dt>
        <dd>{parsedData.transactions.length}</dd>
        <dt>Reusable import rules</dt>
        <dd>{importRules.length}</dd>
        <dt>Net worth</dt>
        <dd>{formatCurrency(parsedData.user.netWorth)}</dd>
      </dl>
    </section>
  );
}
