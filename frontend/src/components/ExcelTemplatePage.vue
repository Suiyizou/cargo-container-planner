<template>
  <section class="algorithm-page excel-template-page">
    <div class="page-title">
      <p>Excel Import</p>
      <h2>Excel 导入与样板</h2>
    </div>

    <div class="excel-import-hero">
      <div>
        <strong>路径一：手动导入 Excel / CSV</strong>
        <p>由浏览器直接识别表头、单位、货物类型和备注规则，导入前先预览并标记异常行。</p>
      </div>
      <div class="excel-import-actions">
        <label class="primary file-button">
          选择文件
          <input type="file" accept=".xlsx,.xls,.csv,.tsv,text/csv" @change="handleFile" />
        </label>
        <button type="button" @click="downloadTemplate">下载样板</button>
      </div>
    </div>

    <div class="excel-summary-grid">
      <div>
        <span>当前文件</span>
        <strong>{{ workbook?.fileName || "尚未选择" }}</strong>
      </div>
      <div>
        <span>有效行</span>
        <strong>{{ (preview?.validRows.length || 0) + manualCorrections.length }}</strong>
      </div>
      <div>
        <span>异常行</span>
        <strong>{{ unresolvedInvalidRows.length }}</strong>
      </div>
      <div>
        <span>聚合后货物</span>
        <strong>{{ approvedAggregated.length }}</strong>
      </div>
      <div>
        <span>导入件数</span>
        <strong>{{ approvedQuantity }}</strong>
      </div>
    </div>

    <div class="algorithm-note agent-workbench">
      <div class="agent-workbench-header">
        <div>
          <strong>路径二：Agent 清洗工作台</strong>
          <p>
            上传非标准表格后先建立清洗任务，后端解析并保存任务结果；当前是规则清洗底座，后续可替换为真实 Agent 异步回填。
          </p>
        </div>
        <div class="excel-import-actions">
          <label class="file-button">
            选择待清洗文件
            <input type="file" accept=".xlsx,.xls,.csv,.tsv,text/csv" @change="handleAgentFile" />
          </label>
          <button class="primary" type="button" :disabled="!agentFile || agentBusy" @click="submitAgentTask">
            {{ agentBusy ? "清洗中..." : "建立清洗任务" }}
          </button>
          <button type="button" :disabled="agentBusy" @click="loadAgentTasks()">刷新任务</button>
        </div>
      </div>

      <div class="agent-status-row">
        <span>当前文件：{{ agentFile?.name || "尚未选择" }}</span>
        <span v-if="agentMessage" :class="agentMessageType === 'error' ? 'excel-warning' : 'excel-ok'">
          {{ agentMessage }}
        </span>
      </div>

      <div v-if="agentTask" class="agent-result-panel">
        <div class="agent-task-title">
          <div>
            <b>{{ agentTask.taskNo }}</b>
            <span>{{ agentTask.originalFileName }}</span>
          </div>
          <em :class="statusClass(agentTask.status)">{{ statusText(agentTask.status) }}</em>
        </div>

        <div class="excel-summary-grid agent-summary-grid">
          <div>
            <span>原始行</span>
            <strong>{{ agentTask.rowCount || 0 }}</strong>
          </div>
          <div>
            <span>有效行</span>
            <strong>{{ agentTask.validCount || 0 }}</strong>
          </div>
          <div>
            <span>异常行</span>
            <strong>{{ agentTask.issueCount || 0 }}</strong>
          </div>
          <div>
            <span>清洗后货物</span>
            <strong>{{ agentCleanedRows.length }}</strong>
          </div>
          <div>
            <span>导入件数</span>
            <strong>{{ agentImportQuantity }}</strong>
          </div>
        </div>

        <p v-if="agentTask.agentNotes" class="agent-note-text">{{ agentTask.agentNotes }}</p>
        <p v-if="agentTask.errorMessage" class="excel-warning">{{ agentTask.errorMessage }}</p>

        <div v-if="agentCleanedRows.length" class="agent-preview-actions">
          <label>
            <span>导入方式</span>
            <select v-model="importMode">
              <option value="replace">替换当前货物</option>
              <option value="append">追加到当前货物</option>
            </select>
          </label>
          <button class="primary" type="button" @click="importAgentRows">
            导入清洗结果
          </button>
          <button type="button" @click="downloadAgentResult">下载清洗后 Excel</button>
        </div>

        <div v-if="agentCleanedRows.length" class="template-table-wrap">
          <table class="template-table sample">
            <thead>
              <tr>
                <th>货物</th>
                <th>尺寸 cm</th>
                <th>数量</th>
                <th>单重 kg</th>
                <th>类型</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cargo in agentCleanedRows.slice(0, 10)" :key="cargoKey(cargo)">
                <td>{{ cargo.name }}</td>
                <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                <td>{{ cargo.quantity }}</td>
                <td>{{ cargo.weightKg }}</td>
                <td>{{ typeText(cargo.type) }}</td>
                <td>{{ cargo.remark || "-" }}</td>
              </tr>
              <tr v-if="agentCleanedRows.length > 10">
                <td colspan="6">还有 {{ agentCleanedRows.length - 10 }} 类清洗结果未显示</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="agentIssues.length" class="template-table-wrap agent-issues">
          <table class="template-table">
            <thead>
              <tr>
                <th>工作表</th>
                <th>行号</th>
                <th>问题</th>
                <th>建议名称</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="issue in agentIssues.slice(0, 6)" :key="`${issue.sheetName}-${issue.rowNumber}`">
                <td>{{ issue.sheetName }}</td>
                <td>{{ issue.rowNumber }}</td>
                <td>{{ issue.errors?.join("；") }}</td>
                <td>{{ issue.suggestion?.cargo?.name || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="agentTasks.length" class="agent-task-grid">
        <button
          v-for="task in agentTasks"
          :key="task.id"
          type="button"
          :class="{ active: agentTask?.id === task.id }"
          @click="selectAgentTask(task.id)"
        >
          <b>{{ task.taskNo }}</b>
          <span>{{ task.originalFileName }}</span>
          <em :class="statusClass(task.status)">{{ statusText(task.status) }} · {{ task.cleanedCount || 0 }} 类</em>
        </button>
      </div>
    </div>

    <div v-if="workbook" class="template-grid">
      <article class="algorithm-note">
        <strong>工作表与单位</strong>
        <div class="excel-control-grid">
          <label>
            <span>工作表</span>
            <select v-model="selectedSheetName" @change="selectSheet">
              <option v-for="sheet in workbook.sheets" :key="sheet.name" :value="sheet.name">
                {{ sheet.name }} / {{ sheet.rows.length }} 行
              </option>
            </select>
          </label>
          <label>
            <span>尺寸单位</span>
            <select v-model="options.dimensionUnit" @change="refreshPreview">
              <option value="auto">自动识别</option>
              <option value="cm">cm</option>
              <option value="mm">mm</option>
              <option value="m">m</option>
            </select>
          </label>
          <label>
            <span>重量单位</span>
            <select v-model="options.weightUnit" @change="refreshPreview">
              <option value="auto">自动识别</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="t">t</option>
            </select>
          </label>
          <label>
            <span>导入方式</span>
            <select v-model="importMode">
              <option value="replace">替换当前货物</option>
              <option value="append">追加到当前货物</option>
            </select>
          </label>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>字段自动映射</strong>
        <div class="mapping-grid">
          <label v-for="field in visibleMappingFields" :key="field.key">
            <span>{{ field.label }}<b v-if="field.required">*</b></span>
            <select v-model="mapping[field.key]" @change="refreshPreview">
              <option value="">未映射</option>
              <option v-for="header in activeSheet.headers" :key="header" :value="header">{{ header }}</option>
            </select>
          </label>
        </div>
      </article>
    </div>

    <div v-if="preview" class="excel-preview-actions">
      <p v-if="unresolvedInvalidRows.length" class="excel-warning">
        有 {{ unresolvedInvalidRows.length }} 行未通过校验，导入时会跳过这些行。
      </p>
      <p v-else class="excel-ok">全部行已通过校验。</p>
      <button class="primary" type="button" :disabled="!approvedAggregated.length" @click="importPreview">
        导入 {{ approvedAggregated.length }} 类 / {{ approvedQuantity }} 件货物
      </button>
    </div>

    <div v-if="preview" class="template-grid">
      <article class="algorithm-note">
        <strong>有效数据预览</strong>
        <div class="template-table-wrap">
          <table class="template-table sample">
            <thead>
              <tr>
                <th>货物</th>
                <th>尺寸 cm</th>
                <th>数量</th>
                <th>单重 kg</th>
                <th>类型</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cargo in approvedAggregated.slice(0, 12)" :key="cargoKey(cargo)">
                <td>{{ cargo.name }}</td>
                <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                <td>{{ cargo.quantity }}</td>
                <td>{{ cargo.weightKg }}</td>
                <td>{{ typeText(cargo.type) }}</td>
                <td>{{ cargo.remark || "-" }}</td>
              </tr>
              <tr v-if="approvedAggregated.length > 12">
                <td colspan="6">还有 {{ approvedAggregated.length - 12 }} 类货物未显示</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>异常行</strong>
        <div class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>行号</th>
                <th>问题</th>
                <th>原始名称</th>
                <th>建议</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in unresolvedInvalidRows.slice(0, 12)" :key="row.rowNumber">
                <td>{{ row.rowNumber }}</td>
                <td>{{ row.errors.join("；") }}</td>
                <td>{{ row.cargo.name || "-" }}</td>
                <td><button type="button" @click="openSuggestion(row)">建议修改</button></td>
              </tr>
              <tr v-if="!unresolvedInvalidRows.length">
                <td colspan="4">暂无异常行</td>
              </tr>
              <tr v-if="unresolvedInvalidRows.length > 12">
                <td colspan="4">还有 {{ unresolvedInvalidRows.length - 12 }} 行异常未显示</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <div class="template-grid">
      <article class="algorithm-note">
        <strong>必填字段</strong>
        <div class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>字段名</th>
                <th>含义</th>
                <th>示例</th>
                <th>校验规则</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in requiredFields" :key="field.key">
                <td><code>{{ field.key }}</code></td>
                <td>{{ field.label }}</td>
                <td>{{ field.example }}</td>
                <td>{{ field.rule }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>可选字段与规则</strong>
        <ul class="formula-list">
          <li><code>type</code>：支持 <code>normal</code>、<code>upright</code>、<code>nonstack</code>、<code>pallet</code>，备注里写“易碎/不可重压/托盘/朝上”也会自动识别。</li>
          <li><code>dimensionText</code>：允许把尺寸写成 <code>60*40*35</code>、<code>60×40×35 cm</code> 或 “长宽高”。</li>
          <li><code>totalWeightKg</code>：如果没有单件重量，可以用总重量除以数量自动换算。</li>
          <li>重复 SKU 或同规格同名称货物会先聚合数量，再写入当前货物列表。</li>
        </ul>
      </article>
    </div>

    <div class="algorithm-note">
      <strong>标准 Excel 示例</strong>
      <div class="template-table-wrap">
        <table class="template-table sample">
          <thead>
            <tr>
              <th v-for="header in sampleHeaders" :key="header">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sampleRows" :key="row.id">
              <td v-for="header in sampleHeaders" :key="header">{{ row[header] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="algorithm-note">
      <strong>Agent 的位置</strong>
      <p>
        当前先用确定性规则完成解析、校验、单位换算和预览。后续 Agent 应该接在“表头低置信度、合并单元格、多层表头、业务备注复杂”的环节，
        只给出清洗建议，最终导入仍然由用户确认。
      </p>
    </div>

    <div v-if="suggestionRow" class="modal-backdrop">
      <div class="modal suggestion-modal">
        <header>
          <div>
            <p>第 {{ suggestionRow.rowNumber }} 行</p>
            <h2>建议修改为标准货物</h2>
          </div>
          <button type="button" @click="closeSuggestion">×</button>
        </header>

        <div class="suggestion-summary">
          <strong>{{ suggestionSummary }}</strong>
          <ul>
            <li v-for="note in suggestionRow.suggestion.notes" :key="note">{{ note }}</li>
            <li v-if="!suggestionRow.suggestion.notes.length">系统已尽量保留原始行中的可识别字段。</li>
          </ul>
        </div>

        <div class="suggestion-form-grid">
          <label>
            <span>货物名称</span>
            <input v-model.trim="suggestionForm.name" />
          </label>
          <label>
            <span>长度 cm</span>
            <input v-model.number="suggestionForm.lengthCm" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>宽度 cm</span>
            <input v-model.number="suggestionForm.widthCm" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>高度 cm</span>
            <input v-model.number="suggestionForm.heightCm" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>数量</span>
            <input v-model.number="suggestionForm.quantity" type="number" min="1" step="1" />
          </label>
          <label>
            <span>单件重量 kg</span>
            <input v-model.number="suggestionForm.weightKg" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>类型</span>
            <select v-model="suggestionForm.type">
              <option value="normal">普通货物</option>
              <option value="upright">保持朝上</option>
              <option value="nonstack">不可重压</option>
              <option value="pallet">托盘/木箱</option>
            </select>
          </label>
          <label>
            <span>备注</span>
            <input v-model.trim="suggestionForm.remark" />
          </label>
        </div>

        <p v-if="suggestionErrors.length" class="excel-warning suggestion-error">
          还需要修改：{{ suggestionErrors.join("；") }}
        </p>

        <div class="modal-actions">
          <button type="button" @click="closeSuggestion">取消</button>
          <button class="primary" type="button" @click="applySuggestion">应用到导入预览</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  aggregateCargos,
  buildPreview,
  downloadTemplateWorkbook,
  importFields,
  readWorkbook,
  validateCargo
} from "../services/excelImport";
import {
  createExcelCleaningTask,
  downloadCleanedExcel,
  fetchExcelCleaningTask,
  fetchExcelCleaningTasks
} from "../services/excelAgentApi";
import { uid } from "../utils/format";

const emit = defineEmits(["import-cargos"]);

const colors = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3"];
const workbook = ref(null);
const selectedSheetName = ref("");
const activeSheet = ref(null);
const preview = ref(null);
const manualCorrections = ref([]);
const suggestionRow = ref(null);
const suggestionErrors = ref([]);
const mapping = reactive({});
const suggestionForm = reactive({
  name: "",
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
const importMode = ref("replace");
const agentFile = ref(null);
const agentBusy = ref(false);
const agentTask = ref(null);
const agentTasks = ref([]);
const agentMessage = ref("");
const agentMessageType = ref("ok");

const visibleMappingFields = computed(() =>
  importFields.filter((field) => field.key !== "totalWeightKg" || mapping.totalWeightKg || activeSheet.value?.headers.length)
);
const correctedRowNumbers = computed(() => new Set(manualCorrections.value.map((cargo) => cargo.sourceRowNumber)));
const unresolvedInvalidRows = computed(() =>
  preview.value ? preview.value.invalidRows.filter((row) => !correctedRowNumbers.value.has(row.rowNumber)) : []
);
const approvedAggregated = computed(() => {
  if (!preview.value) return [];
  return aggregateCargos([
    ...preview.value.validRows.map((row) => row.cargo),
    ...manualCorrections.value
  ]);
});
const approvedQuantity = computed(() =>
  approvedAggregated.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const agentCleanedRows = computed(() => agentTask.value?.cleanedRows || []);
const agentIssues = computed(() => agentTask.value?.issues || []);
const agentImportQuantity = computed(() =>
  agentCleanedRows.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const suggestionSummary = computed(() => {
  if (!suggestionRow.value) return "";
  return `${suggestionForm.name || "未命名货物"}，${suggestionForm.lengthCm || "-"} × ${suggestionForm.widthCm || "-"} × ${suggestionForm.heightCm || "-"} cm，${suggestionForm.quantity || 0} 件，${suggestionForm.weightKg || 0} kg/件`;
});

const requiredFields = [
  { key: "name", label: "货物名称", example: "纸箱 B", rule: "不能为空" },
  { key: "lengthCm", label: "长度 cm", example: "60", rule: "大于 0 的数字" },
  { key: "widthCm", label: "宽度 cm", example: "40", rule: "大于 0 的数字" },
  { key: "heightCm", label: "高度 cm", example: "35", rule: "大于 0 的数字" },
  { key: "quantity", label: "数量", example: "30", rule: "正整数" },
  { key: "weightKg", label: "单件重量 kg", example: "12", rule: "大于等于 0 的数字" }
];

const sampleHeaders = ["name", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color", "remark"];
const sampleRows = [
  { id: 1, name: "蝶阀木箱 A", lengthCm: 110, widthCm: 45, heightCm: 82, quantity: 8, weightKg: 180, type: "pallet", color: "#2a9d8f", remark: "木箱/托盘类" },
  { id: 2, name: "纸箱 B", lengthCm: 60, widthCm: 40, heightCm: 35, quantity: 30, weightKg: 12, type: "normal", color: "#3b82f6", remark: "普通可堆叠" },
  { id: 3, name: "易碎品 C", lengthCm: 55, widthCm: 45, heightCm: 30, quantity: 12, weightKg: 18, type: "nonstack", color: "#8b5cf6", remark: "不可重压" }
];

onMounted(() => {
  loadAgentTasks({ silent: true });
});

async function handleFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  workbook.value = await readWorkbook(file);
  selectedSheetName.value = workbook.value.sheets[0]?.name || "";
  selectSheet();
}

function selectSheet() {
  activeSheet.value = workbook.value?.sheets.find((sheet) => sheet.name === selectedSheetName.value) || null;
  Object.keys(mapping).forEach((key) => delete mapping[key]);
  Object.assign(mapping, activeSheet.value?.mapping || {});
  refreshPreview();
}

function refreshPreview() {
  preview.value = activeSheet.value ? buildPreview(activeSheet.value, mapping, options) : null;
  manualCorrections.value = [];
  closeSuggestion();
}

function importPreview() {
  if (!approvedAggregated.value.length) return;
  const cargos = approvedAggregated.value.map((cargo, index) => ({
    id: uid("cargo"),
    name: cargo.name,
    lengthCm: cargo.lengthCm,
    widthCm: cargo.widthCm,
    heightCm: cargo.heightCm,
    quantity: cargo.quantity,
    weightKg: cargo.weightKg,
    type: cargo.type,
    color: cargo.color || colors[index % colors.length]
  }));
  emit("import-cargos", { cargos, mode: importMode.value, skippedRows: unresolvedInvalidRows.value.length });
}

function handleAgentFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  agentFile.value = file;
  agentMessage.value = "";
}

async function submitAgentTask() {
  if (!agentFile.value) return;
  agentBusy.value = true;
  agentMessage.value = "";
  try {
    agentTask.value = await createExcelCleaningTask(agentFile.value);
    await loadAgentTasks({ silent: true });
    agentMessageType.value = agentTask.value.status === "FAILED" ? "error" : "ok";
    agentMessage.value =
      agentTask.value.status === "FAILED"
        ? "清洗任务失败，请查看错误信息"
        : `清洗完成：${agentTask.value.cleanedCount || 0} 类货物，${agentTask.value.issueCount || 0} 行异常`;
  } catch (error) {
    agentMessageType.value = "error";
    agentMessage.value = `后端清洗接口不可用：${error.message}`;
  } finally {
    agentBusy.value = false;
  }
}

async function loadAgentTasks(options = {}) {
  if (!options.silent) {
    agentBusy.value = true;
    agentMessage.value = "";
  }
  try {
    agentTasks.value = await fetchExcelCleaningTasks();
    if (!agentTask.value && agentTasks.value[0]) {
      agentTask.value = await fetchExcelCleaningTask(agentTasks.value[0].id);
    }
  } catch (error) {
    if (!options.silent) {
      agentMessageType.value = "error";
      agentMessage.value = `任务列表读取失败：${error.message}`;
    }
  } finally {
    if (!options.silent) agentBusy.value = false;
  }
}

async function selectAgentTask(id) {
  agentBusy.value = true;
  agentMessage.value = "";
  try {
    agentTask.value = await fetchExcelCleaningTask(id);
  } catch (error) {
    agentMessageType.value = "error";
    agentMessage.value = `任务读取失败：${error.message}`;
  } finally {
    agentBusy.value = false;
  }
}

function importAgentRows() {
  if (!agentCleanedRows.value.length) return;
  const cargos = agentCleanedRows.value.map((cargo, index) => normalizeImportedCargo(cargo, index));
  emit("import-cargos", { cargos, mode: importMode.value, skippedRows: agentTask.value?.issueCount || 0 });
}

async function downloadAgentResult() {
  if (!agentTask.value?.id) return;
  try {
    await downloadCleanedExcel(agentTask.value.id, `${agentTask.value.taskNo || "cleaned-cargos"}.xlsx`);
  } catch (error) {
    agentMessageType.value = "error";
    agentMessage.value = `下载失败：${error.message}`;
  }
}

function normalizeImportedCargo(cargo, index) {
  return {
    id: uid("cargo"),
    name: cargo.name,
    lengthCm: round2(cargo.lengthCm),
    widthCm: round2(cargo.widthCm),
    heightCm: round2(cargo.heightCm),
    quantity: Math.round(Number(cargo.quantity || 0)),
    weightKg: round2(cargo.weightKg),
    type: cargo.type || "normal",
    color: cargo.color || colors[index % colors.length]
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
    normal: "普通货物",
    upright: "保持朝上",
    nonstack: "不可重压",
    pallet: "托盘/木箱"
  }[type] || "普通货物";
}

function statusText(status) {
  return {
    PENDING: "等待中",
    RUNNING: "清洗中",
    SUCCEEDED: "已完成",
    FAILED: "失败"
  }[status] || status || "-";
}

function statusClass(status) {
  return {
    PENDING: "status-pending",
    RUNNING: "status-running",
    SUCCEEDED: "status-success",
    FAILED: "status-failed"
  }[status] || "status-pending";
}

function cargoKey(cargo) {
  return `${cargo.name}-${cargo.lengthCm}-${cargo.widthCm}-${cargo.heightCm}-${cargo.quantity}-${cargo.type}`;
}
</script>
