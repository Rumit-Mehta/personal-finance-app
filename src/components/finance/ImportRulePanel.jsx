import { Button } from "@/components/ui/button";

export function ImportRulePanel({
  bulkRuleMatchCount,
  onApplyDraftRule,
  onRuleDraftChange,
  onSaveDraftRule,
  ruleDraft,
}) {
  return (
    <div className="rule-panel">
      <label>
        <span>Match field</span>
        <select
          onChange={(event) => onRuleDraftChange("field", event.target.value)}
          value={ruleDraft.field}
        >
          <option value="merchant">Merchant</option>
          <option value="description">Description</option>
          <option value="category">Category</option>
          <option value="type">Type</option>
          <option value="notes">Notes</option>
        </select>
      </label>
      <label>
        <span>Operator</span>
        <select
          onChange={(event) =>
            onRuleDraftChange("operator", event.target.value)
          }
          value={ruleDraft.operator}
        >
          <option value="wildcard">Wildcard</option>
          <option value="startsWith">Starts with</option>
          <option value="contains">Contains</option>
          <option value="equals">Equals</option>
        </select>
      </label>
      <label>
        <span>Match value</span>
        <input
          onChange={(event) => onRuleDraftChange("value", event.target.value)}
          value={ruleDraft.value}
        />
      </label>
      <label>
        <span>Set category</span>
        <input
          list="category-suggestions"
          onChange={(event) =>
            onRuleDraftChange("category", event.target.value)
          }
          value={ruleDraft.category}
        />
      </label>
      <label>
        <span>Set tag</span>
        <input
          onChange={(event) => onRuleDraftChange("tag", event.target.value)}
          value={ruleDraft.tag}
        />
      </label>
      <label>
        <span>Set merchant</span>
        <input
          onChange={(event) =>
            onRuleDraftChange("merchant", event.target.value)
          }
          value={ruleDraft.merchant}
        />
      </label>
      <label>
        <span>Set notes</span>
        <input
          onChange={(event) => onRuleDraftChange("notes", event.target.value)}
          value={ruleDraft.notes}
        />
      </label>
      <div className="rule-panel-actions">
        <span>{bulkRuleMatchCount} matches</span>
        <Button variant="outline" onClick={onApplyDraftRule}>
          Apply
        </Button>
        <Button variant="secondary" onClick={onSaveDraftRule}>
          Save Rule
        </Button>
      </div>
    </div>
  );
}
