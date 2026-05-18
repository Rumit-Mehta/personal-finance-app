import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/formatters";

export function AccountsTable({ accountNames, accounts }) {
  const [showInactiveAccounts, setShowInactiveAccounts] = useState(false);
  const activeAccounts = accounts.filter((account) => account.isActive);
  const inactiveAccounts = accounts.filter((account) => account.isInactive);
  const visibleAccounts = showInactiveAccounts
    ? accounts
    : activeAccounts;
  const accountSummary = showInactiveAccounts
    ? `Showing all ${accounts.length} accounts, including ${inactiveAccounts.length} inactive`
    : `Showing ${activeAccounts.length} active accounts`;
  const ToggleIcon = showInactiveAccounts ? EyeOff : Eye;

  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Accounts</h2>
          <p>{accountSummary}</p>
        </div>
        {inactiveAccounts.length > 0 && (
          <Button
            onClick={() => setShowInactiveAccounts((current) => !current)}
            type="button"
            variant="outline"
          >
            <ToggleIcon />
            {showInactiveAccounts
              ? "Hide inactive accounts"
              : `Show inactive accounts (${inactiveAccounts.length})`}
          </Button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Institution</th>
            <th>Kind</th>
            <th>Status</th>
            <th>Parent</th>
            <th>Balance</th>
            <th>Snapshots</th>
            <th>Transactions</th>
          </tr>
        </thead>
        <tbody>
          {visibleAccounts.map((account) => (
            <tr key={account.id}>
              <td>{account.name}</td>
              <td>{account.type}</td>
              <td>{account.institution}</td>
              <td>{account.accountKind}</td>
              <td>{account.isActive ? "Active" : "Inactive"}</td>
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
          {visibleAccounts.length === 0 && (
            <tr>
              <td colSpan={9}>No active accounts to show.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
