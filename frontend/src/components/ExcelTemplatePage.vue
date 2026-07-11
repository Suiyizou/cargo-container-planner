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
      <div
        v-if="excelMode === 'manual'"
        class="excel-manual-card"
        :class="{ 'is-dragging': manualDropActive, 'is-busy': manualImportBusy }"
        @dragenter.prevent="handleManualDragEnter"
        @dragover.prevent="handleManualDragOver"
        @dragleave.prevent="handleManualDragLeave"
        @drop.prevent="handleManualDrop"
      >
        <div class="excel-import-hero">
          <div>
            <strong>{{ ui('excel.manualPath') }}</strong>
            <p>{{ ui('excel.manualPathText') }}</p>
          </div>
          <div class="excel-import-actions">
            <input
              ref="manualFileInput"
              hidden
              type="file"
              :accept="WORKBOOK_FILE_ACCEPT"
              :disabled="manualImportBusy"
              @change="handleFile"
            />
            <el-button type="primary" :loading="manualImportBusy" @click="openManualFilePicker">
              {{ ui('common.chooseFile') }}
            </el-button>
            <el-button @click="downloadTemplate">{{ ui('common.downloadTemplate') }}</el-button>
          </div>
        </div>

        <div
          class="excel-drop-zone"
          :class="{ active: manualDropActive }"
          role="button"
          tabindex="0"
          :aria-disabled="manualImportBusy"
          @click="openManualFilePicker"
          @keydown.enter.prevent="openManualFilePicker"
          @keydown.space.prevent="openManualFilePicker"
        >
          <el-icon class="excel-drop-icon"><UploadFilled /></el-icon>
          <div class="excel-drop-copy">
            <strong>
              {{ ui(manualImportBusy ? 'excel.dropBusy' : manualDropActive ? 'excel.dropRelease' : 'excel.dropToRecognize') }}
            </strong>
            <span>{{ ui('excel.dropSupportText') }}</span>
          </div>
          <span class="excel-drop-formats">XLSX / XLS / CSV / TSV</span>
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
        <time class="recognition-elapsed" aria-live="polite">
          {{ ui('excel.elapsedTime', { time: recognitionElapsedText }) }}
        </time>
      </div>

      <div v-if="sourceWorkbookFile" class="source-workbook-bar">
        <div>
          <span>{{ ui('excel.sourceWorkbook') }}</span>
          <strong>{{ sourceWorkbookFile.name }}</strong>
          <small>{{ sourceWorkbookFileSize }}</small>
        </div>
        <div class="source-workbook-actions">
          <el-button :disabled="!workbook" @click="openSourceWorkbookPreview">{{ ui('excel.previewWorkbook') }}</el-button>
          <el-button @click="downloadSourceWorkbook">{{ ui('excel.downloadOriginalWorkbook') }}</el-button>
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
            <strong>{{ recognitionReviewFindings.length }}</strong>
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
          <small v-if="recognitionElapsedSeconds">{{ ui('excel.completedIn', { time: recognitionElapsedText }) }}</small>
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
          <el-button :disabled="!recognitionHasResult" @click="openRecognitionReviewDialog">
            {{ ui('excel.openRecognitionReview') }}
          </el-button>
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
      v-model="sourcePreviewOpen"
      class="planner-dialog source-workbook-dialog"
      width="min(1180px, calc(100vw - 32px))"
      destroy-on-close
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui('excel.onlinePreview') }}</p>
          <h2>{{ sourceWorkbookFile?.name || ui('excel.sourceWorkbook') }}</h2>
        </div>
      </template>
      <div class="source-preview-toolbar">
        <el-select v-model="sourcePreviewSheetName">
          <el-option
            v-for="sheet in workbook?.sheets || []"
            :key="sheet.name"
            :label="`${sheet.name} / ${sourceSheetRowCount(sheet)} ${ui('unit.rows')}`"
            :value="sheet.name"
          />
        </el-select>
        <span>{{ ui('excel.previewLimit', { count: SOURCE_PREVIEW_ROW_LIMIT }) }}</span>
      </div>
      <div class="template-table-wrap source-preview-table-wrap">
        <table class="template-table source-preview-table">
          <tbody>
            <tr v-for="(row, rowIndex) in sourcePreviewRows" :key="`source-row-${rowIndex}`">
              <th>{{ rowIndex + 1 }}</th>
              <td v-for="(cell, columnIndex) in row" :key="`source-cell-${rowIndex}-${columnIndex}`">
                {{ cell || '' }}
              </td>
            </tr>
            <tr v-if="!sourcePreviewRows.length">
              <td>{{ ui('excel.emptyWorksheet') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template #footer>
        <el-button @click="downloadSourceWorkbook">{{ ui('excel.downloadOriginalWorkbook') }}</el-button>
        <el-button type="primary" @click="sourcePreviewOpen = false">{{ ui('common.close') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="recognitionReviewDialogOpen"
      :model-value="true"
      class="planner-dialog recognition-review-dialog"
      width="min(920px, calc(100vw - 32px))"
      align-center
      destroy-on-close
      @close="closeRecognitionReviewDialog"
    >
      <template #header>
        <div class="dialog-title">
          <p>{{ ui('excel.recognitionReviewEyebrow') }}</p>
          <h2>{{ ui('excel.recognitionReviewTitle') }}</h2>
        </div>
      </template>

      <div class="recognition-review-body">
        <p class="recognition-review-notice">
          {{ ui('excel.recognitionReviewNotice') }}
        </p>

        <div class="excel-summary-grid recognition-review-metrics">
          <div>
            <span>{{ ui('excel.validItems') }}</span>
            <strong>{{ recognitionRows.length }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.reviewNormalItems') }}</span>
            <strong>{{ recognitionNormalRows.length }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.reviewNeedsConfirmItems') }}</span>
            <strong>{{ recognitionReviewFindings.length }}</strong>
          </div>
          <div>
            <span>{{ ui('excel.importPieces') }}</span>
            <strong>{{ recognitionQuantity }}</strong>
          </div>
        </div>

        <el-collapse v-model="recognitionReviewActiveNames" class="recognition-review-collapse">
          <el-collapse-item name="needsReview">
            <template #title>
              <span class="recognition-review-title-line">
                {{ ui('excel.reviewNeedsConfirm') }}
                <b>{{ recognitionReviewFindings.length }}</b>
              </span>
            </template>

            <div v-if="recognitionReviewFindings.length" class="recognition-review-issue-list">
              <article v-for="finding in recognitionReviewFindings" :key="finding.id" class="recognition-review-issue">
                <header>
                  <strong>{{ finding.title }}</strong>
                  <span class="recognition-review-status">{{ ui('excel.reviewNeedsConfirm') }}</span>
                </header>
                <ol class="recognition-review-three-lines">
                  <li class="recognition-review-line source-line">
                    <div class="recognition-review-line-label">
                      <span>1</span>
                      <strong>{{ ui('excel.reviewOriginalData') }}</strong>
                    </div>
                    <div class="recognition-review-line-content">
                      <small v-if="finding.issue?.rowNumber != null">
                        {{ ui('excel.reviewRowNumber') }} {{ finding.issue.rowNumber }}
                      </small>
                      <p>{{ recognitionReviewSourceText(finding) }}</p>
                    </div>
                  </li>

                  <li class="recognition-review-line agent-line">
                    <div class="recognition-review-line-label">
                      <span>2</span>
                      <strong>{{ ui('excel.reviewAgentSuggestion') }}</strong>
                    </div>
                    <div class="recognition-review-line-content">
                      <div v-if="recognitionReviewSuggestionRows(finding).length" class="recognition-review-inline-fields">
                        <span v-for="row in recognitionReviewSuggestionRows(finding)" :key="`suggestion-${finding.id}-${row.label}`">
                          <b>{{ row.label }}</b>{{ row.value }}
                        </span>
                      </div>
                      <p v-else class="recognition-review-card-empty">{{ ui('excel.reviewNoSuggestion') }}</p>
                      <div class="recognition-review-reason">
                        <strong>{{ ui('excel.reviewSystemJudgement') }}</strong>
                        <ul>
                          <li v-for="message in finding.messages" :key="message">{{ message }}</li>
                        </ul>
                      </div>
                    </div>
                  </li>

                  <li class="recognition-review-line import-line">
                    <div class="recognition-review-line-label">
                      <span>3</span>
                      <strong>{{ ui('excel.reviewImportedCandidate') }}</strong>
                    </div>
                    <div class="recognition-review-line-content">
                      <div v-if="recognitionReviewCargoRows(finding.cargo).length" class="recognition-review-inline-fields import-fields">
                        <span v-for="row in recognitionReviewCargoRows(finding.cargo)" :key="`cargo-${finding.id}-${row.label}`">
                          <b>{{ row.label }}</b>{{ row.value }}
                        </span>
                      </div>
                      <p v-else class="recognition-review-card-empty">{{ ui('excel.reviewNotImportedYet') }}</p>
                    </div>
                    <el-button type="primary" plain :icon="EditPen" @click="editRecognitionReviewCargo(finding)">
                      {{ ui('excel.reviewEditImport') }}
                    </el-button>
                  </li>
                </ol>
              </article>
            </div>
            <p v-else class="recognition-review-empty">{{ ui('excel.reviewNoIssues') }}</p>
          </el-collapse-item>

          <el-collapse-item name="normal">
            <template #title>
              <span class="recognition-review-title-line">
                {{ ui('excel.reviewNormal') }}
                <b>{{ recognitionNormalRows.length }}</b>
              </span>
            </template>

            <div v-if="recognitionNormalRows.length" class="template-table-wrap recognition-review-table-wrap">
              <table class="template-table recognition-review-table">
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
                  <tr v-for="item in recognitionNormalRows" :key="cargoKey(item.cargo, item.index)">
                    <td>{{ item.cargo.name }}</td>
                    <td>{{ item.cargo.model || "-" }}</td>
                    <td>{{ item.cargo.lengthCm }} × {{ item.cargo.widthCm }} × {{ item.cargo.heightCm }}</td>
                    <td>{{ item.cargo.quantity }}</td>
                    <td>{{ item.cargo.weightKg }}</td>
                    <td>{{ typeText(item.cargo.type) }}</td>
                    <td>{{ item.cargo.remark || "-" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="recognition-review-empty">{{ ui('excel.reviewAllNeedConfirm') }}</p>
          </el-collapse-item>
        </el-collapse>
      </div>

      <template #footer>
        <el-button type="primary" @click="closeRecognitionReviewDialog">{{ ui('common.acknowledged') }}</el-button>
      </template>
    </el-dialog>

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
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { EditPen, UploadFilled } from "@element-plus/icons-vue";
import {
  aggregateCargos,
  downloadTemplateWorkbook,
  formatWorkbookForRecognition,
  importFields,
  validateCargo
} from "../services/excelImport";
import { buildPreviewInWorker, readWorkbookInWorker } from "../services/excelImportClient";
import {
  createTextRecognitionTask,
  downloadTextRecognitionExcel,
  fetchTextRecognitionTask
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
const recognitionElapsedSeconds = ref(0);
const sourceWorkbookFile = ref(null);
const sourcePreviewOpen = ref(false);
const sourcePreviewSheetName = ref("");
const manualImportBusy = ref(false);
const manualDropActive = ref(false);
const manualFileInput = ref(null);
const previewBusy = ref(false);
const manualImportMessage = ref("");
const manualImportMessageType = ref("info");
const recognitionAgentTask = ref(null);
const recognitionEditIndex = ref(-1);
const recognitionEditAppendMode = ref(false);
const recognitionEditPackageInfo = ref(null);
const recognitionEditFindingId = ref("");
const recognitionEditErrors = ref([]);
const recognitionReviewDialogOpen = ref(false);
const recognitionReviewActiveNames = ref(["needsReview", "normal"]);
const recognitionReviewIndexOverrides = ref({});
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
const recognitionElapsedText = computed(() => formatElapsedTime(recognitionElapsedSeconds.value));
const sourceWorkbookFileSize = computed(() => formatFileSize(sourceWorkbookFile.value?.size || 0));
const sourcePreviewSheet = computed(() =>
  workbook.value?.sheets?.find((sheet) => sheet.name === sourcePreviewSheetName.value) || workbook.value?.sheets?.[0] || null
);
const SOURCE_PREVIEW_ROW_LIMIT = 200;
const sourcePreviewRows = computed(() => {
  const sheet = sourcePreviewSheet.value;
  const rows = Array.isArray(sheet?.rawRows) && sheet.rawRows.length
    ? sheet.rawRows
    : [[...(sheet?.headers || [])], ...(sheet?.rows || [])];
  return rows.slice(0, SOURCE_PREVIEW_ROW_LIMIT);
});
const recognitionRowsWithIndex = computed(() => recognitionRows.value.map((cargo, index) => ({ cargo, index })));
const recognitionReviewFindings = computed(() => {
  const findings = [];
  const issueCargoKeys = new Set();

  recognitionIssues.value.forEach((issue, index) => {
    const messages = issueMessages(issue);
    if (isSoftRecognitionIssue(issue, messages)) return;
    const cargo = issue?.suggestion?.cargo || null;
    const findingId = `issue-${issue.rowNumber ?? index}-${index}`;
    const overriddenIndex = recognitionReviewIndexOverrides.value[findingId];
    const cargoIndex = Number.isInteger(overriddenIndex)
      && overriddenIndex >= 0
      && overriddenIndex < recognitionRows.value.length
      ? overriddenIndex
      : (cargo ? findRecognitionCargoIndex(cargo) : -1);
    if (cargoIndex >= 0) issueCargoKeys.add(cargoReviewKey(recognitionRows.value[cargoIndex]));
    findings.push({
      id: findingId,
      title: cargoIndex >= 0
        ? reviewCargoTitle(recognitionRows.value[cargoIndex], cargoIndex)
        : (cargo?.name ? suggestionCargoLabel(cargo) : ui("excel.reviewUnknownItem")),
      source: issue.text || issue.rawText || "",
      messages,
      issue,
      suggestion: issue?.suggestion || null,
      cargo: cargoIndex >= 0 ? recognitionRows.value[cargoIndex] : cargo,
      index: cargoIndex
    });
  });

  recognitionRows.value.forEach((cargo, index) => {
    const reasons = cargoReviewReasons(cargo);
    const key = cargoReviewKey(cargo);
    if (!reasons.length || issueCargoKeys.has(key)) return;
    findings.push({
      id: `cargo-review-${index}`,
      title: reviewCargoTitle(cargo, index),
      source: cargo.remark || "",
      messages: reasons,
      issue: null,
      suggestion: null,
      cargo,
      index
    });
  });

  return findings;
});
const recognitionReviewIndexes = computed(() => new Set(
  recognitionReviewFindings.value
    .map((finding) => finding.index)
    .filter((index) => index >= 0)
));
const recognitionNormalRows = computed(() =>
  recognitionRowsWithIndex.value.filter((item) => !recognitionReviewIndexes.value.has(item.index))
);
const recognitionSkippedIssueCount = computed(() =>
  recognitionIssues.value.filter((issue) => {
    const messages = issueMessages(issue);
    if (isSoftRecognitionIssue(issue, messages)) return false;
    const text = messages.join(" ").toLowerCase();
    if (text.includes("\u590d\u6838") || text.includes("review:")) return false;
    const cargo = issue?.suggestion?.cargo || null;
    return !cargo || findRecognitionCargoIndex(cargo) < 0;
  }).length
);
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
const reviewKeywords = {
  emptyPallet: ["\u7a7a\u6258\u76d8", "\u7a7a\u6258", "\u7a7a\u6728\u6258", "empty pallet", "empty skid"],
  mixedPallet: ["\u62fc\u88c5", "\u62fc\u6258", "\u6df7\u88c5", "\u5408\u62fc", "\u5171\u6258", "mixed pallet", "combined pallet", "mixed skid", "combined skid"],
  uncertain: ["\u53ef\u80fd", "\u4e0d\u786e\u5b9a", "\u672a\u786e\u8ba4", "\u7591\u4f3c", "\u4eba\u5de5\u786e\u8ba4", "\u91cd\u590d", "\u590d\u6838", "uncertain", "maybe", "possible", "duplicate"],
  standalone: ["\u5355\u72ec", "\u72ec\u7acb", "\u5355\u4e2a", "separate", "standalone", "alone"],
  pallet: ["\u6258\u76d8", "\u6728\u6258", "\u6808\u677f", "pallet", "skid"]
};
const hardRecognitionIssueKeywords = [
  "\u7f3a\u5c11\u8d27\u7269\u540d\u79f0",
  "\u540d\u79f0\u672a\u8bc6\u522b",
  "\u957f\u5ea6\u5fc5\u987b",
  "\u5bbd\u5ea6\u5fc5\u987b",
  "\u9ad8\u5ea6\u5fc5\u987b",
  "\u5c3a\u5bf8\u672a\u8bc6\u522b",
  "\u6570\u91cf\u5fc5\u987b",
  "\u6570\u91cf\u672a\u8bc6\u522b",
  "missing name",
  "invalid name",
  "missing dimension",
  "invalid dimension",
  "missing quantity",
  "invalid quantity"
];
const WORKBOOK_FILE_ACCEPT = ".xlsx,.xls,.csv,.tsv,text/csv,text/tab-separated-values";
const SUPPORTED_WORKBOOK_FILE_PATTERN = /\.(xlsx|xls|csv|tsv)$/i;

let previewSeq = 0;
let workbookVersion = 0;
let lastPreviewSignature = "";
let pendingPreviewSignature = "";
let manualDragDepth = 0;

function openManualFilePicker() {
  if (manualImportBusy.value) return;
  manualFileInput.value?.click();
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  await loadWorkbookFile(file);
}

function handleManualDragEnter(event) {
  if (manualImportBusy.value || !dragContainsFiles(event)) return;
  manualDragDepth += 1;
  manualDropActive.value = true;
}

function handleManualDragOver(event) {
  if (manualImportBusy.value || !dragContainsFiles(event)) return;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  manualDropActive.value = true;
}

function handleManualDragLeave() {
  if (!manualDropActive.value) return;
  manualDragDepth = Math.max(0, manualDragDepth - 1);
  if (manualDragDepth === 0) manualDropActive.value = false;
}

async function handleManualDrop(event) {
  manualDragDepth = 0;
  manualDropActive.value = false;
  if (manualImportBusy.value) return;

  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  if (files.length > 1) {
    showManualFileError(ui("excel.dropSingleFileOnly"));
    return;
  }
  await loadWorkbookFile(files[0]);
}

function dragContainsFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function isSupportedWorkbookFile(file) {
  return Boolean(file?.name && SUPPORTED_WORKBOOK_FILE_PATTERN.test(file.name));
}

function showManualFileError(message) {
  manualImportMessageType.value = "error";
  manualImportMessage.value = message;
}

async function loadWorkbookFile(file) {
  if (!isSupportedWorkbookFile(file)) {
    showManualFileError(ui("excel.dropUnsupportedFile", { name: file?.name || "-" }));
    return;
  }
  manualImportBusy.value = true;
  sourceWorkbookFile.value = file;
  startRecognitionTimer();
  preview.value = null;
  activeSheet.value = null;
  manualImportMessageType.value = "info";
  manualImportMessage.value = ui("excel.agentPreparingFromExcel");
  try {
    workbook.value = await readWorkbookInWorker(file);
    workbookVersion += 1;
    lastPreviewSignature = "";
    pendingPreviewSignature = "";
    selectedSheetName.value = workbook.value?.sheets?.[0]?.name || "";
    activeSheet.value = workbook.value?.sheets?.[0] || null;
    manualCorrections.value = [];
    const formattedText = formatWorkbookForRecognition(workbook.value, { fileName: file?.name });
    recognitionText.value = formattedText;
    excelMode.value = "recognition";
    manualImportMessageType.value = "success";
    manualImportMessage.value = ui("excel.agentSubmittedFromExcel", { count: workbook.value?.sheets?.length || 0 });
    await submitTextRecognitionTask({
      textOverride: formattedText,
      sourceName: file?.name || ui("excel.excelFormattedSource"),
      keepTimer: true
    });
  } catch (error) {
    workbook.value = null;
    activeSheet.value = null;
    preview.value = null;
    manualImportMessageType.value = "error";
    manualImportMessage.value = error?.message || ui("excel.excelAgentFailed");
  } finally {
    manualImportBusy.value = false;
    if (!recognitionAgentBusy.value) stopRecognitionTimer();
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
  recognitionReviewIndexOverrides.value = {};
  recognitionMessage.value = "";
  closeRecognitionReviewDialog();
  closeRecognitionEdit();
}

async function submitTextRecognitionTask(options = {}) {
  const text = String(options.textOverride ?? recognitionText.value).trim();
  if (!text) return;
  if (!options.keepTimer) startRecognitionTimer();
  recognitionAgentBusy.value = true;
  recognitionMessage.value = "";
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  recognitionReviewIndexOverrides.value = {};
  try {
    const task = await createTextRecognitionTask(text, {
      sourceName: options.sourceName || ui("excel.pastedTextSource"),
      mode: "agent",
      languageHint: "auto"
    });
    recognitionAgentTask.value = task?.id ? await fetchTextRecognitionTask(task.id) : task;
    closeRecognitionEdit();
    recognitionMessageType.value = recognitionAgentTask.value.status === "FAILED" ? "error" : "ok";
    recognitionMessage.value =
      recognitionAgentTask.value.status === "FAILED"
        ? `智能识别失败：${recognitionAgentTask.value.errorMessage || "请检查后端任务日志"}`
        : ui("excel.recognitionCompleteMessage", {
            types: recognitionRows.value.length,
            pieces: recognitionQuantity.value,
            review: recognitionReviewFindings.value.length
          });
    if (recognitionAgentTask.value.status === "FAILED") {
      closeRecognitionReviewDialog();
    } else {
      openRecognitionReviewDialog();
    }
  } catch (error) {
    recognitionMessageType.value = "error";
    recognitionMessage.value = `智能识别接口不可用：${error.message}`;
    closeRecognitionReviewDialog();
  } finally {
    recognitionAgentBusy.value = false;
    stopRecognitionTimer();
  }
}

let recognitionTimerId = null;

function startRecognitionTimer() {
  stopRecognitionTimer();
  recognitionElapsedSeconds.value = 0;
  const startedAt = Date.now();
  recognitionTimerId = window.setInterval(() => {
    recognitionElapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
  }, 250);
}

function stopRecognitionTimer() {
  if (recognitionTimerId != null) {
    window.clearInterval(recognitionTimerId);
    recognitionTimerId = null;
  }
}

function formatElapsedTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}:${String(remaining).padStart(2, "0")}` : `${remaining} ${ui("unit.seconds")}`;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function sourceSheetRowCount(sheet) {
  return (sheet?.rawRows?.length || sheet?.rows?.length || 0);
}

function openSourceWorkbookPreview() {
  if (!workbook.value) return;
  sourcePreviewSheetName.value = workbook.value.sheets?.[0]?.name || "";
  sourcePreviewOpen.value = true;
}

function downloadSourceWorkbook() {
  if (!sourceWorkbookFile.value) return;
  const url = URL.createObjectURL(sourceWorkbookFile.value);
  const link = document.createElement("a");
  link.href = url;
  link.download = sourceWorkbookFile.value.name || "source-workbook.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

onBeforeUnmount(stopRecognitionTimer);

function fillRecognitionSample() {
  sourceWorkbookFile.value = null;
  sourcePreviewOpen.value = false;
  recognitionText.value = t("smartImport.recognitionSample");
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  recognitionReviewIndexOverrides.value = {};
  closeRecognitionReviewDialog();
  closeRecognitionEdit();
  recognitionMessage.value = t("smartImport.sampleLoadedMessage");
  recognitionMessageType.value = "ok";
}

function clearRecognition() {
  sourceWorkbookFile.value = null;
  sourcePreviewOpen.value = false;
  recognitionText.value = "";
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  recognitionReviewIndexOverrides.value = {};
  closeRecognitionReviewDialog();
  closeRecognitionEdit();
  recognitionMessage.value = "";
}

function importRecognitionRows() {
  if (!recognitionRows.value.length) return;
  const cargos = recognitionRows.value.map((cargo, index) => normalizeImportedCargo(cargo, index));
  emit("import-cargos", { cargos, mode: importMode.value, skippedRows: recognitionSkippedIssueCount.value });
}

function openRecognitionReviewDialog() {
  recognitionReviewActiveNames.value = recognitionReviewFindings.value.length ? ["needsReview", "normal"] : ["normal"];
  recognitionReviewDialogOpen.value = true;
}

function closeRecognitionReviewDialog() {
  recognitionReviewDialogOpen.value = false;
}

function editRecognitionReviewCargo(finding) {
  if (!finding) return;
  const cargo = finding.cargo || finding.suggestion?.cargo || {
    name: ui("excel.reviewUnknownItem"),
    model: "",
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
    quantity: 1,
    weightKg: 0,
    type: "normal",
    remark: recognitionReviewSourceText(finding)
  };
  const append = finding.index < 0;
  const index = append ? recognitionRows.value.length : finding.index;
  closeRecognitionReviewDialog();
  openRecognitionEdit(cargo, index, { append, findingId: finding.id });
}

function issueMessages(issue) {
  const errors = Array.isArray(issue?.errors) ? issue.errors.filter(Boolean) : [];
  if (errors.length) return errors;
  const message = String(issue?.message || "").trim();
  return message ? [message] : [ui("excel.reviewUnknownReason")];
}

function isSoftRecognitionIssue(issue, messages = []) {
  const suggestion = issue?.suggestion || {};
  const text = [
    issue?.message,
    issue?.text,
    issue?.rawText,
    ...(Array.isArray(issue?.errors) ? issue.errors : []),
    ...(Array.isArray(suggestion.notes) ? suggestion.notes : []),
    ...(Array.isArray(suggestion.errors) ? suggestion.errors : []),
    ...messages
  ].filter(Boolean).join(" ").toLowerCase();
  if (hardRecognitionIssueKeywords.some((keyword) => text.includes(keyword))) return false;
  return text.includes("review:")
    || containsReviewKeyword(text, reviewKeywords.emptyPallet)
    || containsReviewKeyword(text, reviewKeywords.mixedPallet)
    || containsReviewKeyword(text, reviewKeywords.uncertain)
    || (containsReviewKeyword(text, reviewKeywords.standalone) && containsReviewKeyword(text, reviewKeywords.pallet));
}

function cargoReviewReasons(cargo) {
  const text = reviewSearchText(cargo);
  const reasons = [];
  if (cargo?.type === "pallet" && Number(cargo?.weightKg || 0) <= 0) {
    reasons.push(ui("excel.reviewReasonPalletWeight"));
  }
  return [...new Set(reasons)];
}

function containsReviewKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function reviewSearchText(cargo) {
  let packageText = "";
  try {
    packageText = cargo?.packageInfo ? JSON.stringify(cargo.packageInfo) : "";
  } catch {
    packageText = "";
  }
  return [
    cargo?.name,
    cargo?.model,
    cargo?.remark,
    cargo?.type,
    packageText
  ].filter(Boolean).join(" ").toLowerCase();
}

function reviewCargoTitle(cargo, index) {
  const label = suggestionCargoLabel(cargo) || ui("excel.reviewUnknownItem");
  return `${index + 1}. ${label} · ${cargo.lengthCm || "-"} × ${cargo.widthCm || "-"} × ${cargo.heightCm || "-"} cm`;
}

function recognitionReviewSourceText(finding) {
  const issue = finding?.issue || {};
  return issue.text || issue.rawText || finding?.source || finding?.cargo?.remark || "-";
}

function recognitionReviewSuggestionRows(finding) {
  const suggestion = finding?.suggestion || {};
  const rows = recognitionReviewCargoRows(suggestion.cargo);
  const notes = reviewListValue(suggestion.notes);
  if (notes) rows.push({ label: ui("excel.reviewAgentNotes"), value: notes });
  const errors = reviewListValue(suggestion.errors);
  if (errors) rows.push({ label: ui("excel.reviewValidation"), value: errors });
  return rows;
}

function recognitionReviewCargoRows(cargo) {
  if (!cargo) return [];
  const rows = [
    { label: ui("common.cargo"), value: cargo.name || "-" },
    { label: ui("common.model"), value: cargo.model || "-" },
    { label: ui("common.dimensionsCm"), value: recognitionDimensionText(cargo) },
    { label: ui("common.quantity"), value: cargo.quantity ?? "-" },
    { label: ui("common.unitWeightKg"), value: cargo.weightKg ?? "-" },
    { label: ui("common.type"), value: typeText(cargo.type) }
  ];
  if (cargo.remark) rows.push({ label: ui("common.remark"), value: cargo.remark });
  return rows;
}

function recognitionDimensionText(cargo) {
  return `${cargo?.lengthCm ?? "-"} × ${cargo?.widthCm ?? "-"} × ${cargo?.heightCm ?? "-"} cm`;
}

function reviewListValue(value) {
  if (!Array.isArray(value)) return "";
  return value.filter(Boolean).map((item) => reviewValue(item)).join("；");
}

function reviewValue(value) {
  if (value == null || value === "") return "-";
  if (typeof value === "object") {
    try {
      const text = JSON.stringify(value);
      return text.length > 260 ? `${text.slice(0, 260)}...` : text;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function findRecognitionCargoIndex(cargo) {
  const key = cargoReviewKey(cargo);
  return recognitionRows.value.findIndex((item) => cargoReviewKey(item) === key);
}

function cargoReviewKey(cargo) {
  if (!cargo) return "";
  return [
    cargo.name || "",
    cargo.model || "",
    Number(cargo.lengthCm || 0),
    Number(cargo.widthCm || 0),
    Number(cargo.heightCm || 0),
    Number(cargo.quantity || 0),
    Number(cargo.weightKg || 0),
    cargo.type || ""
  ].join("|");
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

function openRecognitionEdit(cargo, index, options = {}) {
  recognitionEditIndex.value = index;
  recognitionEditAppendMode.value = Boolean(options.append);
  recognitionEditPackageInfo.value = cargo.packageInfo || null;
  recognitionEditFindingId.value = options.findingId || "";
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
  recognitionEditAppendMode.value = false;
  recognitionEditPackageInfo.value = null;
  recognitionEditFindingId.value = "";
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
  const rows = recognitionEditAppendMode.value
    ? [...recognitionRows.value, cargo]
    : recognitionRows.value.map((item, index) =>
        index === recognitionEditIndex.value ? { ...item, ...cargo } : item
      );
  if (recognitionEditFindingId.value) {
    recognitionReviewIndexOverrides.value = {
      ...recognitionReviewIndexOverrides.value,
      [recognitionEditFindingId.value]: recognitionEditIndex.value
    };
  }
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
    packageInfo: recognitionEditPackageInfo.value
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
