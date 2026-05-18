import { formatCurrency } from "@/utils/formatters";
import { EDITABLE_IMPORT_FIELDS } from "@/utils/importPreview";

export function ImportPreviewTable({
  importPreview,
  importPreviewAccountNames,
  onPreviewFieldChange,
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Account</th>
            <th>Category</th>
            <th>Tag</th>
            <th>Merchant</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {importPreview.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.date}</td>
              <td>{row.description}</td>
              <td>{formatCurrency(row.amount)}</td>
              <td>{importPreviewAccountNames.get(row.account) ?? row.account}</td>
              {EDITABLE_IMPORT_FIELDS.map((field) => (
                <td key={field}>
                  <input
                    list={
                      field === "category" ? "category-suggestions" : undefined
                    }
                    onChange={(event) =>
                      onPreviewFieldChange(row.id, field, event.target.value)
                    }
                    value={row[field]}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
