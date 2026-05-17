import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ImportRulePanel({
  bulkRuleMatchCount,
  onApplyDraftRule,
  onSaveDraftRule,
  ruleDraft,
}) {
  const [localRuleDraft, setLocalRuleDraft] = useState(ruleDraft);

  useEffect(() => {
    setLocalRuleDraft(ruleDraft);
  }, [ruleDraft]);

  function updateLocalRuleDraft(field, value) {
    setLocalRuleDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  return (
    <div className="rule-panel">
      <label>
        <span>Match field</span>
        <select
          onChange={(event) =>
            updateLocalRuleDraft("field", event.target.value)
          }
          value={localRuleDraft.field}
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
            updateLocalRuleDraft("operator", event.target.value)
          }
          value={localRuleDraft.operator}
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
          onChange={(event) =>
            updateLocalRuleDraft("value", event.target.value)
          }
          value={localRuleDraft.value}
        />
      </label>
      <label>
        <span>Set category</span>
        <input
          list="category-suggestions"
          onChange={(event) =>
            updateLocalRuleDraft("category", event.target.value)
          }
          value={localRuleDraft.category}
        />
      </label>
      <label>
        <span>Set tag</span>
        <input
          onChange={(event) => updateLocalRuleDraft("tag", event.target.value)}
          value={localRuleDraft.tag}
        />
      </label>
      <label>
        <span>Set merchant</span>
        <input
          onChange={(event) =>
            updateLocalRuleDraft("merchant", event.target.value)
          }
          value={localRuleDraft.merchant}
        />
      </label>
      <label>
        <span>Set notes</span>
        <input
          onChange={(event) =>
            updateLocalRuleDraft("notes", event.target.value)
          }
          value={localRuleDraft.notes}
        />
      </label>
      <div className="rule-panel-actions">
        <span>{bulkRuleMatchCount} matches</span>
        <Button
          variant="outline"
          onClick={() => onApplyDraftRule(localRuleDraft)}
        >
          Apply
        </Button>
        <Button
          variant="secondary"
          onClick={() => onSaveDraftRule(localRuleDraft)}
        >
          Save Rule
        </Button>
      </div>
    </div>
  );
}
