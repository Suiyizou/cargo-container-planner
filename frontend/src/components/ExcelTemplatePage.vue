<template>
  <section class="algorithm-page excel-template-page">
    <div class="page-title">
      <p>{{ tr("Smart Import") }}</p>
      <h2>{{ ui('excel.title') }}</h2>
    </div>

    <div class="excel-workspace-layout">
      <el-menu
        class="excel-side-menu"
        :default-active="excelMode"
        @select="switchExcelMode"
      >
        <el-menu-item index="manual">
          <div class="excel-menu-item">
            <strong>{{ ui('excel.manualImport') }}</strong>
            <span>{{ ui('excel.manualSubtitle') }}</span>
          </div>
        </el-menu-item>
        <el-menu-item index="recognition">
          <div class="excel-menu-item">
            <strong class="recognition-menu-label">
              <span class="hollow-star" aria-hidden="true">☆</span>
              {{ ui('excel.smartRecognition') }}
            </strong>
            <span>{{ ui('excel.recognitionSubtitle') }}</span>
          </div>
        </el-menu-item>
        <el-menu-item index="reference">
          <div class="excel-menu-item">
            <strong>{{ ui('excel.fieldTemplate') }}</strong>
            <span>{{ ui('excel.fieldSubtitle') }}</span>
          </div>
        </el-menu-item>
      </el-menu>

      <div class="excel-main-pane">
      <div v-if="excelMode === 'manual'" class="excel-manual-card">
        <div class="excel-import-hero">
          <div>
            <strong>{{ ui('excel.manualPath') }}</strong>
            <p>{{ ui('excel.manualPathText') }}</p>
          </div>
          <div class="excel-import-actions">
            <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls,.csv,.tsv,text/csv" :disabled="manualImportBusy" :on-change="handleWorkbookUpload">
              <el-button type="primary" :loading="manualImportBusy">{{ ui('common.chooseFile') }}</el-button>
            </el-upload>
            <el-button @click="downloadTemplate">{{ ui('common.downloadTemplate') }}</el-button>
          </div>
        </div>

        <el-alert
          v-if="importStatusMessage"
          :key="importStatusMessage"
          class="excel-import-status"
          :type="importStatusType"
          :title="importStatusMessage"
          show-icon
          :closable="false"
        />
        <el-skeleton v-if="manualImportBusy || previewBusy" class="excel-import-skeleton" :rows="3" animated />

        <div class="excel-summary-grid">
          <div>
            <span>{{ ui('excel.currentFile') }}</span>
            <strong>{{ workbook?.fileName || ui('common.notSelected') }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.validRows') }}</span>
            <strong>{{ manualValidRowCount }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.issueRows') }}</span>
            <strong>{{ unresolvedInvalidRows.length }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.aggregatedCargo') }}</span>
            <strong>{{ approvedAggregated.length }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.importPieces') }}</span>
            <strong>{{ approvedQuantity }}</strong>
          </div>
        </div>
      </div>

    <div v-else-if="excelMode === 'recognition'" class="algorithm-note smart-recognition-card">
      <div class="recognition-head">
        <div>
          <strong class="recognition-title">
            <span class="hollow-star" aria-hidden="true">☆</span>
            {{ ui('excel.recognitionPath') }}
          </strong>
          <p>{{ ui('excel.recognitionPathText') }}</p>
        </div>
        <div class="recognition-actions">
          <el-button @click="fillRecognitionSample">{{ ui('common.useSample') }}</el-button>
          <el-button @click="clearRecognition">{{ ui('common.clear') }}</el-button>
          <el-button type="primary" :disabled="!recognitionText.trim() || recognitionAgentBusy" :loading="recognitionAgentBusy" @click="submitTextRecognitionTask">
            <span class="hollow-star button-star" aria-hidden="true">☆</span>
            {{ recognitionAgentBusy ? ui('excel.recognizing') : ui('excel.smartRecognition') }}
          </el-button>
        </div>
      </div>
      <el-input
        v-model="recognitionText"
        type="textarea"
        @input="resetRecognitionResult"
        :rows="10"
        :placeholder="t('smartImport.recognitionPlaceholder')"
      />

      <div v-if="recognitionAgentBusy" class="recognition-loading-panel">
        <span class="recognition-loader"></span>
        <div>
          <strong>{{ ui('excel.recognizingCargo') }}</strong>
          <p>{{ ui('excel.recognizingCargoText') }}</p>
        </div>
      </div>

      <div v-if="recognitionMessage" class="recognition-placeholder" :class="{ error: recognitionMessageType === 'error' }">
        <span>{{ ui(recognitionMessageType === "error" ? 'excel.needsAction' : 'excel.recognitionTip') }}</span>
        <strong>{{ recognitionMessage }}</strong>
      </div>

      <template v-if="recognitionHasResult">
        <div class="excel-summary-grid recognition-summary-grid">
          <div>
            <span>{{ ui('excel.textItems') }}</span>
            <strong>{{ recognitionTotalRows }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.validItems') }}</span>
            <strong>{{ recognitionValidCount }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.issueItems') }}</span>
            <strong>{{ recognitionIssues.length }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.aggregatedCargo') }}</span>
            <strong>{{ recognitionRows.length }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.importPieces') }}</span>
            <strong>{{ recognitionQuantity }}</strong>
          </div>
        </div>

        <div v-if="recognitionAgentTask" class="agent-status-row text-agent-status">
          <span>{{ recognitionAgentTask.taskNo }} · {{ recognitionAgentTask.agentNotes }}</span>
          <el-button :disabled="!recognitionAgentTask.id" @click="downloadRecognitionAgentResult">
            {{ ui('common.downloadRecognitionExcel') }}
          </el-button>
        </div>

        <div class="recognition-import-row">
          <el-form-item :label="ui('excel.importMode')">
            <el-select v-model="importMode">
              <el-option :label="ui('excel.replaceCargo')" value="replace" />
              <el-option :label="ui('excel.appendCargo')" value="append" />
            </el-select>
          </el-form-item>
          <el-button type="primary" :disabled="!recognitionRows.length" @click="importRecognitionRows">
            {{ ui('common.import') }} {{ recognitionRows.length }} {{ ui('unit.classes') }} / {{ recognitionQuantity }} {{ ui('unit.cargoPieces') }}
          </el-button>
        </div>

        <div v-if="recognitionRows.length" class="template-table-wrap">
          <table class="template-table sample">
            <thead>
              <tr>
                <th>{{ ui('common.cargo') }}</th>
                <th>{{ ui('common.model') }}</th>
                <th>{{ ui('common.dimensionsCm') }}</th>
                <th>{{ ui('common.quantity') }}</th>
                <th>{{ ui('common.unitWeightKg') }}</th>
                <th>{{ ui('common.type') }}</th>
                <th>{{ ui('common.remark') }}</th>
                <th>{{ ui('common.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(cargo, index) in recognitionRows" :key="cargoKey(cargo, index)">
                <td>{{ cargo.name }}</td>
                <td>{{ cargo.model || "-" }}</td>
                <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                <td>{{ cargo.quantity }}</td>
                <td>{{ cargo.weightKg }}</td>
                <td>{{ typeText(cargo.type) }}</td>
                <td>{{ cargo.remark || "-" }}</td>
                <td>
                  <el-button link type="primary" @click="openRecognitionEdit(cargo, index)">{{ ui('common.edit') }}</el-button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="recognitionIssues.length" class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>{{ ui('common.sourceLine') }}</th>
                <th>{{ ui('common.issue') }}</th>
                <th>{{ ui('common.suggestedName') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in recognitionIssues" :key="`issue-${row.rowNumber}`">
                <td>{{ row.text || row.rawText || "-" }}</td>
                <td>{{ row.errors?.join("；") || row.message || "-" }}</td>
                <td>{{ suggestionCargoLabel(row.suggestion?.cargo) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

      </div>
    </div>

    <div v-if="excelMode === 'manual' && workbook && !backendImportActive" class="template-grid">
      <article class="algorithm-note">
        <strong>{{ ui('excel.workbookAndUnits') }}</strong>
        <div class="excel-control-grid">
          <el-form-item :label="ui('excel.worksheet')">
            <el-select v-model="selectedSheetName" @change="selectSheet">
              <el-option
                v-for="sheet in workbook.sheets"
                :key="sheet.name"
                :label="`${sheet.name} / ${sheet.rows.length} ${ui('unit.rows')}`"
                :value="sheet.name"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="ui('excel.dimensionUnit')">
            <el-select v-model="options.dimensionUnit" @change="refreshPreview">
              <el-option :label="ui('excel.autoDetect')" value="auto" />
              <el-option label="cm" value="cm" />
              <el-option label="mm" value="mm" />
              <el-option label="m" value="m" />
            </el-select>
          </el-form-item>
          <el-form-item :label="ui('excel.weightUnit')">
            <el-select v-model="options.weightUnit" @change="refreshPreview">
              <el-option :label="ui('excel.autoDetect')" value="auto" />
              <el-option label="kg" value="kg" />
              <el-option label="g" value="g" />
              <el-option label="t" value="t" />
            </el-select>
          </el-form-item>
          <el-form-item :label="ui('excel.importMode')">
            <el-select v-model="importMode">
              <el-option :label="ui('excel.replaceCargo')" value="replace" />
              <el-option :label="ui('excel.appendCargo')" value="append" />
            </el-select>
          </el-form-item>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>{{ ui('excel.fieldMapping') }}</strong>
        <div class="mapping-grid">
          <el-form-item v-for="field in visibleMappingFields" :key="field.key" :label="field.required ? `${tr(field.label)}*` : tr(field.label)">
            <el-select v-model="mapping[field.key]" @change="refreshPreview">
              <el-option :label="ui('excel.unmapped')" value="" />
              <el-option v-for="header in activeSheet.headers" :key="header" :label="header" :value="header" />
            </el-select>
          </el-form-item>
        </div>
      </article>
    </div>

    <div v-if="excelMode === 'manual' && preview" class="excel-preview-actions">
      <p v-if="unresolvedInvalidRows.length" class="excel-warning">
        {{ ui('common.has') }} {{ unresolvedInvalidRows.length }} {{ ui('excel.rowsFailedValidation') }}
      </p>
      <p v-else class="excel-ok">{{ ui('excel.allRowsValid') }}</p>
      <el-button type="primary" :disabled="!approvedAggregated.length" @click="importPreview">
        {{ ui('common.import') }} {{ approvedAggregated.length }} {{ ui('unit.classes') }} / {{ approvedQuantity }} {{ ui('unit.cargoPieces') }}
      </el-button>
    </div>

    <div v-if="excelMode === 'manual' && preview" class="template-grid">
      <article class="algorithm-note">
        <strong>{{ ui('excel.validPreview') }}</strong>
        <div class="template-table-wrap">
          <table class="template-table sample">
            <thead>
              <tr>
                <th>{{ ui('common.cargo') }}</th>
                <th>{{ ui('common.model') }}</th>
                <th>{{ ui('common.dimensionsCm') }}</th>
                <th>{{ ui('common.quantity') }}</th>
                <th>{{ ui('common.unitWeightKg') }}</th>
                <th>{{ ui('common.type') }}</th>
                <th>{{ ui('common.remark') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cargo in approvedAggregated.slice(0, 12)" :key="cargoKey(cargo)">
                <td>{{ cargo.name }}</td>
                <td>{{ cargo.model || "-" }}</td>
                <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                <td>{{ cargo.quantity }}</td>
                <td>{{ cargo.weightKg }}</td>
                <td>{{ typeText(cargo.type) }}</td>
                <td>{{ cargo.remark || "-" }}</td>
              </tr>
              <tr v-if="approvedAggregated.length > 12">
                <td colspan="7">{{ ui('common.more') }} {{ approvedAggregated.length - 12 }} {{ ui('excel.moreCargoHidden') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>{{ ui('excel.issueRows') }}</strong>
        <div class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>{{ ui('common.rowNumber') }}</th>
                <th>{{ ui('common.issue') }}</th>
                <th>{{ ui('common.originalName') }}</th>
                <th>{{ ui('common.suggestion') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in unresolvedInvalidRows.slice(0, 12)" :key="row.rowNumber">
                <td>{{ row.rowNumber }}</td>
                <td>{{ row.errors.join("；") }}</td>
                <td>{{ row.cargo.name || "-" }}</td>
                <td><el-button link type="primary" @click="openSuggestion(row)">{{ ui('excel.suggestEdit') }}</el-button></td>
              </tr>
              <tr v-if="!unresolvedInvalidRows.length">
                <td colspan="4">{{ ui('excel.noIssueRows') }}</td>
              </tr>
              <tr v-if="unresolvedInvalidRows.length > 12">
                <td colspan="4">{{ ui('common.more') }} {{ unresolvedInvalidRows.length - 12 }} {{ ui('excel.moreIssueRowsHidden') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <div v-if="excelMode === 'reference'" class="template-grid">
      <article class="algorithm-note">
        <strong>{{ ui('excel.requiredFields') }}</strong>
        <div class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>{{ ui('common.fieldName') }}</th>
                <th>{{ ui('common.meaning') }}</th>
                <th>{{ ui('common.example') }}</th>
                <th>{{ ui('common.validationRule') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in requiredFields" :key="field.key">
                <td><code>{{ field.key }}</code></td>
                <td>{{ tr(field.label) }}</td>
                <td>{{ field.example }}</td>
                <td>{{ tr(field.rule) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>{{ ui('excel.optionalRules') }}</strong>
        <ul class="formula-list">
          <li>{{ ui('excel.rule.type') }}</li>
          <li>{{ ui('excel.rule.dimensionText') }}</li>
          <li>{{ ui('excel.rule.model') }}</li>
          <li>{{ ui('excel.rule.totalWeight') }}</li>
          <li>{{ ui('excel.rule.duplicateSku') }}</li>
        </ul>
      </article>
    </div>

    <div v-if="excelMode === 'reference'" class="algorithm-note">
      <strong>{{ ui('excel.standardExample') }}</strong>
      <div class="template-table-wrap">
        <table class="template-table sample">
          <thead>
            <tr>
              <th v-for="header in sampleHeaders" :key="header">{{ tr(header) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sampleRows" :key="row.id">
              <td v-for="header in sampleHeaders" :key="header">{{ typeof row[header] === "string" ? tr(row[header]) : row[header] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="excelMode === 'reference'" class="algorithm-note">
      <strong>{{ ui('excel.recognitionPosition') }}</strong>
      <p>
        {{ ui('excel.recognitionPositionText') }}
      </p>
    </div>

    <el-dialog
      v-if="suggestionRow"
      :model-value="true"
      class="planner-dialog"
      width="720px"
      align-center
      destroy-on-close
      @close="closeSuggestion"
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui('unit.row') }} {{ suggestionRow.rowNumber }}</p>
          <h2>{{ ui('excel.suggestStandardCargo') }}</h2>
        </div>
      </template>

        <div class="suggestion-summary">
          <strong>{{ suggestionSummary }}</strong>
          <ul>
            <li v-for="note in suggestionRow.suggestion.notes" :key="note">{{ note }}</li>
            <li v-if="!suggestionRow.suggestion.notes.length">{{ ui('excel.preserveFields') }}</li>
          </ul>
        </div>

        <el-form :model="suggestionForm" label-position="top" class="suggestion-form-grid">
          <el-form-item :label="ui('excel.cargoName')">
            <el-input v-model.trim="suggestionForm.name" />
          </el-form-item>
          <el-form-item :label="ui('excel.modelSpec')">
            <el-input v-model.trim="suggestionForm.model" />
          </el-form-item>
          <el-form-item :label="ui('excel.lengthCm')">
            <el-input-number v-model="suggestionForm.lengthCm" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('excel.widthCm')">
            <el-input-number v-model="suggestionForm.widthCm" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('excel.heightCm')">
            <el-input-number v-model="suggestionForm.heightCm" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('common.quantity')">
            <el-input-number v-model="suggestionForm.quantity" :min="1" :step="1" :precision="0" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('excel.singleWeightKg')">
            <el-input-number v-model="suggestionForm.weightKg" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('common.type')">
            <el-select v-model="suggestionForm.type">
              <el-option :label="ui('cargo.normal')" value="normal" />
              <el-option :label="ui('cargo.upright')" value="upright" />
              <el-option :label="ui('cargo.nonstack')" value="nonstack" />
              <el-option :label="ui('cargo.pallet')" value="pallet" />
            </el-select>
          </el-form-item>
          <el-form-item :label="ui('common.remark')">
            <el-input v-model.trim="suggestionForm.remark" />
          </el-form-item>
        </el-form>

        <p v-if="suggestionErrors.length" class="excel-warning suggestion-error">
          {{ ui('excel.needsChanges') }}：{{ suggestionErrors.join("；") }}
        </p>

      <template #footer>
        <el-button @click="closeSuggestion">{{ ui('common.cancel') }}</el-button>
        <el-button type="primary" @click="applySuggestion">{{ ui('common.applyToImportPreview') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="recognitionEditIndex >= 0"
      :model-value="true"
      class="planner-dialog"
      width="720px"
      align-center
      destroy-on-close
      @close="closeRecognitionEdit"
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui('excel.recognitionResultNo') }} {{ recognitionEditIndex + 1 }}</p>
          <h2>{{ ui('excel.editRecognitionCargo') }}</h2>
        </div>
      </template>

        <div class="suggestion-summary">
          <strong>{{ recognitionEditSummary }}</strong>
          <ul>
            <li>{{ ui('excel.editNoAgent') }}</li>
            <li>{{ ui('excel.editUseCase') }}</li>
          </ul>
        </div>

        <el-form :model="recognitionEditForm" label-position="top" class="suggestion-form-grid">
          <el-form-item :label="ui('excel.cargoName')">
            <el-input v-model.trim="recognitionEditForm.name" />
          </el-form-item>
          <el-form-item :label="ui('excel.modelSpec')">
            <el-input v-model.trim="recognitionEditForm.model" />
          </el-form-item>
          <el-form-item :label="ui('excel.lengthCm')">
            <el-input-number v-model="recognitionEditForm.lengthCm" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('excel.widthCm')">
            <el-input-number v-model="recognitionEditForm.widthCm" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('excel.heightCm')">
            <el-input-number v-model="recognitionEditForm.heightCm" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('common.quantity')">
            <el-input-number v-model="recognitionEditForm.quantity" :min="1" :step="1" :precision="0" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('excel.singleWeightKg')">
            <el-input-number v-model="recognitionEditForm.weightKg" :min="0" :step="0.01" :precision="2" controls-position="right" />
          </el-form-item>
          <el-form-item :label="ui('common.type')">
            <el-select v-model="recognitionEditForm.type">
              <el-option :label="ui('cargo.normal')" value="normal" />
              <el-option :label="ui('cargo.upright')" value="upright" />
              <el-option :label="ui('cargo.nonstack')" value="nonstack" />
              <el-option :label="ui('cargo.pallet')" value="pallet" />
            </el-select>
          </el-form-item>
          <el-form-item :label="ui('common.remark')">
            <el-input v-model.trim="recognitionEditForm.remark" />
          </el-form-item>
        </el-form>

        <p v-if="recognitionEditErrors.length" class="excel-warning suggestion-error">
          {{ ui('excel.needsChanges') }}：{{ recognitionEditErrors.join("；") }}
        </p>

      <template #footer>
        <el-button @click="closeRecognitionEdit">{{ ui('common.cancel') }}</el-button>
        <el-button type="primary" @click="applyRecognitionEdit">{{ ui('common.saveToRecognitionResult') }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import {
  aggregateCargos,
  downloadTemplateWorkbook,
  importFields,
  validateCargo
} from "../services/excelImport";
import { buildPreviewInWorker, readWorkbookInWorker } from "../services/excelImportClient";
import {
  createTextRecognitionTask,
  downloadTextRecognitionExcel,
  fetchTextRecognitionTask,
  parseCargoImportFile
} from "../services/excelAgentApi";
import { currentLocale, t } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";
import { uid } from "../utils/format";

const emit = defineEmits(["import-cargos"]);
const props = defineProps({
  currentCargoCount: {
    type: Number,
    default: 0
  }
});

function tr(value) {
  return translateLegacyText(value == null ? "" : String(value), currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

const colors = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3"];
const workbook = ref(null);
const selectedSheetName = ref("");
const activeSheet = ref(null);
const preview = ref(null);
const excelMode = ref("manual");
const recognitionText = ref("");
const recognitionPreview = ref(null);
const recognitionMessage = ref("");
const recognitionMessageType = ref("ok");
const recognitionAgentBusy = ref(false);
const manualImportBusy = ref(false);
const previewBusy = ref(false);
const manualImportMessage = ref("");
const manualImportMessageType = ref("info");
const recognitionAgentTask = ref(null);
const recognitionEditIndex = ref(-1);
const recognitionEditErrors = ref([]);
const manualCorrections = ref([]);
const suggestionRow = ref(null);
const suggestionErrors = ref([]);
const mapping = reactive({});
const suggestionForm = reactive({
  name: "",
  model: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  quantity: 1,
  weightKg: 0,
  type: "normal",
  color: "",
  sku: "",
  remark: ""
});
const recognitionEditForm = reactive({
  name: "",
  model: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  quantity: 1,
  weightKg: 0,
  type: "normal",
  color: "",
  sku: "",
  remark: ""
});
const options = reactive({ dimensionUnit: "auto", weightUnit: "auto" });
const importMode = ref(props.currentCargoCount > 0 ? "append" : "replace");
const visibleMappingFields = computed(() =>
  importFields.filter((field) => field.key !== "totalWeightKg" || mapping.totalWeightKg || activeSheet.value?.headers.length)
);
const backendImportActive = computed(() => workbook.value?.source === "backend");
const correctedRowNumbers = computed(() => new Set(manualCorrections.value.map((cargo) => cargo.sourceRowNumber)));
const unresolvedInvalidRows = computed(() =>
  preview.value ? preview.value.invalidRows.filter((row) => !correctedRowNumbers.value.has(row.rowNumber)) : []
);
const approvedAggregated = computed(() => {
  if (!preview.value) return [];
  const baseCargos = Array.isArray(preview.value.aggregated) && preview.value.aggregated.length
    ? preview.value.aggregated
    : preview.value.validRows.map((row) => row.cargo);
  return aggregateCargos([
    ...baseCargos,
    ...manualCorrections.value
  ]);
});
const approvedQuantity = computed(() =>
  approvedAggregated.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const manualValidRowCount = computed(() => previewValidRowCount(preview.value) + manualCorrections.value.length);
const importStatusMessage = computed(() => {
  if (!preview.value) return manualImportMessage.value;
  return preview.value.invalidRows.length
    ? `已完成预览：${previewValidRowCount(preview.value)} 行有效，${preview.value.invalidRows.length} 行需要确认。`
    : `已完成预览：${previewValidRowCount(preview.value)} 行全部通过校验。`;
});
const importStatusType = computed(() => {
  if (!preview.value) return manualImportMessageType.value;
  return preview.value.invalidRows.length ? "warning" : "success";
});
const recognitionRows = computed(() => recognitionAgentTask.value?.cleanedRows || []);
const recognitionIssues = computed(() => recognitionAgentTask.value?.issues || []);
const recognitionQuantity = computed(() =>
  recognitionRows.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const recognitionTotalRows = computed(() => recognitionAgentTask.value?.rowCount ?? 0);
const recognitionValidCount = computed(() => recognitionAgentTask.value?.validCount ?? 0);
const recognitionHasResult = computed(() => Boolean(recognitionAgentTask.value));
const suggestionSummary = computed(() => {
  if (!suggestionRow.value) return "";
  const label = suggestionForm.model ? `${suggestionForm.name || "未命名货物"} ${suggestionForm.model}` : suggestionForm.name || "未命名货物";
  return `${label}，${suggestionForm.lengthCm || "-"} × ${suggestionForm.widthCm || "-"} × ${suggestionForm.heightCm || "-"} cm，${suggestionForm.quantity || 0} 件，${suggestionForm.weightKg || 0} kg/件`;
});
const recognitionEditSummary = computed(() => {
  if (recognitionEditIndex.value < 0) return "";
  const label = recognitionEditForm.model
    ? `${recognitionEditForm.name || "未命名货物"} ${recognitionEditForm.model}`
    : recognitionEditForm.name || "未命名货物";
  return `${label}，${recognitionEditForm.lengthCm || "-"} × ${recognitionEditForm.widthCm || "-"} × ${recognitionEditForm.heightCm || "-"} cm，${recognitionEditForm.quantity || 0} 件，${recognitionEditForm.weightKg || 0} kg/件`;
});

const requiredFields = [
  { key: "name", label: "货物名称", example: "纸箱 B", rule: "不能为空" },
  { key: "lengthCm", label: "长度 cm", example: "60", rule: "大于 0 的数字" },
  { key: "widthCm", label: "宽度 cm", example: "40", rule: "大于 0 的数字" },
  { key: "heightCm", label: "高度 cm", example: "35", rule: "大于 0 的数字" },
  { key: "quantity", label: "数量", example: "30", rule: "正整数" },
  { key: "weightKg", label: "单件重量 kg", example: "12", rule: "大于等于 0 的数字" }
];

const sampleHeaders = ["name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color", "remark"];
const sampleRows = [
  { id: 1, name: "蝶阀木箱", model: "100", lengthCm: 110, widthCm: 45, heightCm: 82, quantity: 8, weightKg: 180, type: "pallet", color: "#2a9d8f", remark: "木箱/托盘类" },
  { id: 2, name: "纸箱 B", model: "", lengthCm: 60, widthCm: 40, heightCm: 35, quantity: 30, weightKg: 12, type: "normal", color: "#3b82f6", remark: "普通可堆叠" },
  { id: 3, name: "易碎品 C", model: "", lengthCm: 55, widthCm: 45, heightCm: 30, quantity: 12, weightKg: 18, type: "nonstack", color: "#8b5cf6", remark: "不可重压" }
];

let previewSeq = 0;
let workbookVersion = 0;
let lastPreviewSignature = "";
let pendingPreviewSignature = "";

async function handleWorkbookUpload(uploadFile) {
  if (uploadFile.raw) await loadWorkbookFile(uploadFile.raw);
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  await loadWorkbookFile(file);
}

async function loadWorkbookFile(file) {
  manualImportBusy.value = true;
  preview.value = null;
  activeSheet.value = null;
  manualImportMessageType.value = "info";
  manualImportMessage.value = "正在上传到后端解析，请稍候。";
  try {
    const backendResult = await parseCargoImportFile(file);
    applyBackendImportResult(backendResult, file);
  } catch (backendError) {
    await loadWorkbookFileLocally(file, backendError);
  } finally {
    manualImportBusy.value = false;
  }
}

async function loadWorkbookFileLocally(file, backendError) {
  manualImportMessageType.value = backendError ? "warning" : "info";
  manualImportMessage.value = backendError
    ? `后端解析不可用，已切换浏览器本地解析：${backendError.message}`
    : "正在解析文件，请稍候。大文件会在后台线程处理，页面不会被阻塞。";
  try {
    workbook.value = await readWorkbookInWorker(file);
    workbookVersion += 1;
    lastPreviewSignature = "";
    pendingPreviewSignature = "";
    selectedSheetName.value = workbook.value.sheets[0]?.name || "";
    manualCorrections.value = [];
    manualImportMessageType.value = "info";
    manualImportMessage.value = `已读取 ${workbook.value.sheets.length} 个工作表，正在生成预览。`;
    void selectSheet();
  } catch (error) {
    workbook.value = null;
    activeSheet.value = null;
    preview.value = null;
    manualImportMessageType.value = "error";
    manualImportMessage.value = error?.message || "文件解析失败，请检查 Excel/CSV 格式。";
  }
}

function applyBackendImportResult(result, file) {
  workbookVersion += 1;
  lastPreviewSignature = "";
  pendingPreviewSignature = "";
  workbook.value = result?.workbook || {
    source: "backend",
    fileName: file?.name || result?.fileName || "",
    sheets: []
  };
  workbook.value.source = "backend";
  selectedSheetName.value = workbook.value.sheets?.[0]?.name || "";
  activeSheet.value = result?.activeSheet || workbook.value.sheets?.[0] || null;
  Object.keys(mapping).forEach((key) => delete mapping[key]);
  Object.assign(mapping, activeSheet.value?.mapping || {});
  preview.value = normalizeBackendPreview(result?.preview);
  manualCorrections.value = [];
  applyPreviewMessage(preview.value);
}

function switchExcelMode(mode) {
  excelMode.value = mode === "agent" ? "recognition" : mode;
}

async function selectSheet() {
  activeSheet.value = workbook.value?.sheets.find((sheet) => sheet.name === selectedSheetName.value) || null;
  Object.keys(mapping).forEach((key) => delete mapping[key]);
  Object.assign(mapping, activeSheet.value?.mapping || {});
  if (backendImportActive.value) {
    if (preview.value) applyPreviewMessage(preview.value);
    return;
  }
  await refreshPreview();
}

async function refreshPreview() {
  if (backendImportActive.value) {
    if (preview.value) applyPreviewMessage(preview.value);
    return;
  }
  const sheet = cloneSheetForWorker(activeSheet.value);
  if (!sheet) {
    preview.value = null;
    return;
  }
  const workerMapping = { ...mapping };
  const workerOptions = { ...options };
  const signature = previewSignature(sheet, workerMapping, workerOptions);
  if (signature === pendingPreviewSignature) return;
  if (signature === lastPreviewSignature && preview.value) {
    previewBusy.value = false;
    applyPreviewMessage(preview.value);
    return;
  }
  const seq = ++previewSeq;
  pendingPreviewSignature = signature;
  previewBusy.value = true;
  if (!preview.value) {
    manualImportMessageType.value = "info";
    manualImportMessage.value = "正在校验行数据与字段映射...";
  }
  try {
    const nextPreview = await buildPreviewInWorker(sheet, workerMapping, workerOptions);
    if (seq !== previewSeq) return;
    preview.value = nextPreview;
    lastPreviewSignature = signature;
    applyPreviewMessage(nextPreview);
  } catch (error) {
    if (seq !== previewSeq) return;
    preview.value = null;
    manualImportMessageType.value = "error";
    manualImportMessage.value = error?.message || "预览校验失败，请检查字段映射。";
  } finally {
    if (seq === previewSeq) {
      if (pendingPreviewSignature === signature) pendingPreviewSignature = "";
      previewBusy.value = false;
    }
  }
  manualCorrections.value = [];
  closeSuggestion();
}

function previewSignature(sheet, workerMapping, workerOptions) {
  return JSON.stringify({
    workbookVersion,
    sheetName: sheet.name,
    headerRowIndex: sheet.headerRowIndex,
    headers: sheet.headers,
    rowCount: sheet.rows.length,
    mapping: workerMapping,
    options: workerOptions
  });
}

function applyPreviewMessage(nextPreview) {
  manualImportMessageType.value = nextPreview.invalidRows.length ? "warning" : "success";
  manualImportMessage.value = nextPreview.invalidRows.length
    ? `已完成预览：${previewValidRowCount(nextPreview)} 行有效，${nextPreview.invalidRows.length} 行需要确认。`
    : `已完成预览：${previewValidRowCount(nextPreview)} 行全部通过校验。`;
}

function cloneSheetForWorker(sheet) {
  if (!sheet) return null;
  return {
    name: sheet.name,
    headerRowIndex: Number(sheet.headerRowIndex || 0),
    headers: [...(sheet.headers || [])],
    rows: (sheet.rows || []).map((row) => [...row]),
    mapping: { ...(sheet.mapping || {}) }
  };
}

function normalizeBackendPreview(nextPreview) {
  const normalized = nextPreview || {};
  const validRows = Array.isArray(normalized.validRows) ? normalized.validRows : [];
  const invalidRows = Array.isArray(normalized.invalidRows) ? normalized.invalidRows : [];
  const aggregated = Array.isArray(normalized.aggregated) ? normalized.aggregated : [];
  return {
    totalRows: Number(normalized.totalRows || validRows.length + invalidRows.length),
    validRowCount: Number(normalized.validRowCount ?? validRows.length),
    invalidRowCount: Number(normalized.invalidRowCount ?? invalidRows.length),
    validRows,
    invalidRows,
    aggregated,
    importedQuantity: Number(normalized.importedQuantity || aggregated.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)),
    skippedRows: Number(normalized.skippedRows ?? invalidRows.length),
    validRowsSampled: Boolean(normalized.validRowsSampled)
  };
}

function previewValidRowCount(nextPreview) {
  if (!nextPreview) return 0;
  return Number(nextPreview.validRowCount ?? nextPreview.validRows?.length ?? 0);
}

function resetRecognitionResult() {
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  recognitionMessage.value = "";
  closeRecognitionEdit();
}

async function submitTextRecognitionTask() {
  if (!recognitionText.value.trim()) return;
  recognitionAgentBusy.value = true;
  recognitionMessage.value = "";
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  try {
    const task = await createTextRecognitionTask(recognitionText.value, {
      sourceName: "智能识别粘贴文本",
      mode: "agent",
      languageHint: "auto"
    });
    recognitionAgentTask.value = task?.id ? await fetchTextRecognitionTask(task.id) : task;
    closeRecognitionEdit();
    recognitionMessageType.value = recognitionAgentTask.value.status === "FAILED" ? "error" : "ok";
    recognitionMessage.value =
      recognitionAgentTask.value.status === "FAILED"
        ? `智能识别失败：${recognitionAgentTask.value.errorMessage || "请检查后端任务日志"}`
        : `智能识别完成：${recognitionRows.value.length} 类货物，${recognitionQuantity.value} 件；${recognitionIssues.value.length} 条需要人工确认。`;
  } catch (error) {
    recognitionMessageType.value = "error";
    recognitionMessage.value = `智能识别接口不可用：${error.message}`;
  } finally {
    recognitionAgentBusy.value = false;
  }
}

function fillRecognitionSample() {
  recognitionText.value = t("smartImport.recognitionSample");
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  closeRecognitionEdit();
  recognitionMessage.value = t("smartImport.sampleLoadedMessage");
  recognitionMessageType.value = "ok";
}

function clearRecognition() {
  recognitionText.value = "";
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  closeRecognitionEdit();
  recognitionMessage.value = "";
}

function importRecognitionRows() {
  if (!recognitionRows.value.length) return;
  const cargos = recognitionRows.value.map((cargo, index) => normalizeImportedCargo(cargo, index));
  emit("import-cargos", { cargos, mode: importMode.value, skippedRows: recognitionIssues.value.length });
}

async function downloadRecognitionAgentResult() {
  if (!recognitionAgentTask.value?.id) return;
  try {
    await downloadTextRecognitionExcel(recognitionAgentTask.value.id, `${recognitionAgentTask.value.taskNo || "text-recognition"}.xlsx`);
  } catch (error) {
    recognitionMessageType.value = "error";
    recognitionMessage.value = `下载失败：${error.message}`;
  }
}

function importPreview() {
  if (!approvedAggregated.value.length) return;
  const cargos = approvedAggregated.value.map((cargo, index) => ({
    id: uid("cargo"),
    name: cargo.name,
    model: cargo.model || "",
    lengthCm: cargo.lengthCm,
    widthCm: cargo.widthCm,
    heightCm: cargo.heightCm,
    quantity: cargo.quantity,
    weightKg: cargo.weightKg,
    type: cargo.type,
    color: cargo.color || colors[index % colors.length],
    sku: cargo.sku || "",
    remark: cargo.remark || "",
    packageInfo: cargo.packageInfo || null
  }));
  emit("import-cargos", { cargos, mode: importMode.value, skippedRows: unresolvedInvalidRows.value.length });
}

function normalizeImportedCargo(cargo, index) {
  return {
    id: uid("cargo"),
    name: cargo.name,
    model: cargo.model || "",
    lengthCm: round2(cargo.lengthCm),
    widthCm: round2(cargo.widthCm),
    heightCm: round2(cargo.heightCm),
    quantity: Math.round(Number(cargo.quantity || 0)),
    weightKg: round2(cargo.weightKg),
    type: cargo.type || "normal",
    color: cargo.color || colors[index % colors.length],
    sku: cargo.sku || "",
    remark: cargo.remark || "",
    packageInfo: cargo.packageInfo || null
  };
}

function openRecognitionEdit(cargo, index) {
  recognitionEditIndex.value = index;
  Object.assign(recognitionEditForm, {
    name: cargo.name || "",
    model: cargo.model || "",
    lengthCm: cargo.lengthCm || "",
    widthCm: cargo.widthCm || "",
    heightCm: cargo.heightCm || "",
    quantity: cargo.quantity || 1,
    weightKg: cargo.weightKg || 0,
    type: cargo.type || "normal",
    color: cargo.color || "",
    sku: cargo.sku || "",
    remark: cargo.remark || ""
  });
  recognitionEditErrors.value = [];
}

function closeRecognitionEdit() {
  recognitionEditIndex.value = -1;
  recognitionEditErrors.value = [];
}

function applyRecognitionEdit() {
  if (!recognitionAgentTask.value || recognitionEditIndex.value < 0) return;
  const cargo = normalizeRecognitionEditCargo();
  const errors = validateCargo(cargo);
  if (errors.length) {
    recognitionEditErrors.value = errors;
    return;
  }
  const rows = recognitionRows.value.map((item, index) =>
    index === recognitionEditIndex.value ? { ...item, ...cargo } : item
  );
  recognitionAgentTask.value = { ...recognitionAgentTask.value, cleanedRows: rows };
  recognitionMessageType.value = "ok";
  recognitionMessage.value = `已修改第 ${recognitionEditIndex.value + 1} 条识别结果，可继续编辑或直接导入。`;
  closeRecognitionEdit();
}

function normalizeRecognitionEditCargo() {
  return {
    name: String(recognitionEditForm.name || "").trim(),
    model: String(recognitionEditForm.model || "").trim(),
    lengthCm: round2(recognitionEditForm.lengthCm),
    widthCm: round2(recognitionEditForm.widthCm),
    heightCm: round2(recognitionEditForm.heightCm),
    quantity: Math.round(Number(recognitionEditForm.quantity || 0)),
    weightKg: round2(recognitionEditForm.weightKg),
    type: recognitionEditForm.type || "normal",
    color: recognitionEditForm.color || "",
    sku: recognitionEditForm.sku || "",
    remark: String(recognitionEditForm.remark || "").trim(),
    packageInfo: recognitionRows.value[recognitionEditIndex.value]?.packageInfo || null
  };
}

function openSuggestion(row) {
  suggestionRow.value = row;
  Object.assign(suggestionForm, row.suggestion.cargo);
  suggestionErrors.value = [...row.suggestion.errors];
}

function closeSuggestion() {
  suggestionRow.value = null;
  suggestionErrors.value = [];
}

function applySuggestion() {
  const cargo = normalizeSuggestionCargo();
  const errors = validateCargo(cargo);
  if (errors.length) {
    suggestionErrors.value = errors;
    return;
  }
  const rowNumber = suggestionRow.value.rowNumber;
  manualCorrections.value = [
    ...manualCorrections.value.filter((item) => item.sourceRowNumber !== rowNumber),
    { ...cargo, sourceRowNumber: rowNumber }
  ];
  closeSuggestion();
}

function normalizeSuggestionCargo() {
  return {
    name: String(suggestionForm.name || "").trim(),
    model: String(suggestionForm.model || "").trim(),
    lengthCm: round2(suggestionForm.lengthCm),
    widthCm: round2(suggestionForm.widthCm),
    heightCm: round2(suggestionForm.heightCm),
    quantity: Math.round(Number(suggestionForm.quantity || 0)),
    weightKg: round2(suggestionForm.weightKg),
    type: suggestionForm.type || "normal",
    color: suggestionForm.color || "",
    sku: suggestionForm.sku || "",
    remark: String(suggestionForm.remark || "").trim()
  };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function downloadTemplate() {
  downloadTemplateWorkbook(sampleRows);
}

function typeText(type) {
  return {
    normal: ui('cargo.normal'),
    upright: ui('cargo.upright'),
    nonstack: ui('cargo.nonstack'),
    pallet: ui('cargo.pallet')
  }[type] || ui('cargo.normal');
}

function suggestionCargoLabel(cargo) {
  if (!cargo?.name) return "-";
  return cargo.model ? `${cargo.name} ${cargo.model}` : cargo.name;
}

function cargoKey(cargo, index = "") {
  return `${index}-${cargo.name}-${cargo.lengthCm}-${cargo.widthCm}-${cargo.heightCm}-${cargo.quantity}-${cargo.weightKg}-${cargo.type}`;
}
</script>
