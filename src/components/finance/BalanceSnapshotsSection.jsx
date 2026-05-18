import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/utils/formatters";

export function BalanceSnapshotsSection({
  accounts,
  balanceSnapshotDraft,
  balanceSnapshots,
  accountNames,
  onBalanceSnapshotDraftChange,
  onSaveBalanceSnapshot,
}) {
  const actualAccounts = accounts.filter((account) => account.isActual);

  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Balance snapshots</h2>
          <p>Manual corrections reset the end-of-day balance from that date.</p>
        </div>
      </div>

      <div className="balance-panel">
        <label>
          <span>Account</span>
          <select
            onChange={(event) =>
              onBalanceSnapshotDraftChange("accountId", event.target.value)
            }
            value={balanceSnapshotDraft.accountId}
          >
            {actualAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name || account.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Date</span>
          <input
            onChange={(event) =>
              onBalanceSnapshotDraftChange("date", event.target.value)
            }
            type="date"
            value={balanceSnapshotDraft.date}
          />
        </label>
        <label>
          <span>Balance</span>
          <input
            inputMode="decimal"
            onChange={(event) =>
              onBalanceSnapshotDraftChange("balance", event.target.value)
            }
            type="number"
            value={balanceSnapshotDraft.balance}
          />
        </label>
        <label>
          <span>Notes</span>
          <input
            onChange={(event) =>
              onBalanceSnapshotDraftChange("notes", event.target.value)
            }
            value={balanceSnapshotDraft.notes}
          />
        </label>
        <Button disabled={actualAccounts.length === 0} onClick={onSaveBalanceSnapshot}>
          Save correction
        </Button>
      </div>

      {balanceSnapshots.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Date</th>
              <th>Balance</th>
              <th>Source</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {balanceSnapshots.slice(0, 12).map((snapshot) => (
              <tr key={snapshot.id}>
                <td>
                  {accountNames.get(snapshot.accountId)?.name ??
                    snapshot.accountId}
                </td>
                <td>{formatDate(snapshot.date)}</td>
                <td>{formatCurrency(snapshot.balance)}</td>
                <td>{snapshot.sourceType || snapshot.sourceProvider}</td>
                <td>{snapshot.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
