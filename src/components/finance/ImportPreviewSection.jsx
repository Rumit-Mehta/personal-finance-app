import { Button } from "@/components/ui/button";
import { ImportAccountPanel } from "@/components/finance/ImportAccountPanel";
import { ImportPreviewTable } from "@/components/finance/ImportPreviewTable";
import { ImportRulePanel } from "@/components/finance/ImportRulePanel";
import { SavedRulesList } from "@/components/finance/SavedRulesList";

export function ImportPreviewSection({
  bulkRuleMatchCount,
  categorySuggestions,
  importAccountMode,
  importAccountOptions,
  importPreview,
  importPreviewAccountNames,
  importRules,
  newAccountDraft,
  onApplyDraftRule,
  onImportAccountModeChange,
  onNewAccountDraftChange,
  onPreviewFieldChange,
  onRuleDraftChange,
  onSaveDraftRule,
  onSaveImportPreview,
  onSelectedImportAccountChange,
  ruleDraft,
  selectedImportAccountId,
}) {
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>CSV Import Preview</h2>
          <p>
            {importPreview.rows.length} staged transactions from{" "}
            {importPreview.sourceProvider}.
          </p>
        </div>
        <Button onClick={onSaveImportPreview}>Save Import</Button>
      </div>

      <ImportAccountPanel
        importAccountMode={importAccountMode}
        importAccountOptions={importAccountOptions}
        newAccountDraft={newAccountDraft}
        onImportAccountModeChange={onImportAccountModeChange}
        onNewAccountDraftChange={onNewAccountDraftChange}
        onSelectedImportAccountChange={onSelectedImportAccountChange}
        selectedImportAccountId={selectedImportAccountId}
      />

      <ImportRulePanel
        bulkRuleMatchCount={bulkRuleMatchCount}
        onApplyDraftRule={onApplyDraftRule}
        onRuleDraftChange={onRuleDraftChange}
        onSaveDraftRule={onSaveDraftRule}
        ruleDraft={ruleDraft}
      />

      {importRules.length > 0 && <SavedRulesList importRules={importRules} />}

      <datalist id="category-suggestions">
        {categorySuggestions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <ImportPreviewTable
        importPreview={importPreview}
        importPreviewAccountNames={importPreviewAccountNames}
        onPreviewFieldChange={onPreviewFieldChange}
      />
    </section>
  );
}
