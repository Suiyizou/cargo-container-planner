<template>
  <section class="algorithm-page excel-template-page">
    <div class="page-title">
      <p>Smart Import</p>
      <h2>智能导入</h2>
    </div>

    <div class="excel-workspace-layout">
      <aside class="excel-side-menu">
        <button type="button" :class="{ active: excelMode === 'manual' }" @click="switchExcelMode('manual')">
          手动导入
          <span>本地识别、校验和建议修改</span>
        </button>
        <button type="button" :class="{ active: excelMode === 'recognition' }" @click="switchExcelMode('recognition')">
          <span class="recognition-menu-label">
            <span class="hollow-star" aria-hidden="true">☆</span>
            智能识别
          </span>
          <span>粘贴货物描述，提取标准规格</span>
        </button>
        <button type="button" :class="{ active: excelMode === 'reference' }" @click="switchExcelMode('reference')">
          字段样板
          <span>标准字段、规则和示例</span>
        </button>
      </aside>

      <div class="excel-main-pane">
      <div v-if="excelMode === 'manual'" class="excel-manual-card">
        <div class="excel-import-hero">
          <div>
            <strong>路径一：手动导入 Excel / CSV</strong>
            <p>浏览器直接识别表头、单位和规则，导入前先预览并标记异常行。</p>
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
      </div>

    <div v-else-if="excelMode === 'recognition'" class="algorithm-note smart-recognition-card">
      <div class="recognition-head">
        <div>
          <strong class="recognition-title">
            <span class="hollow-star" aria-hidden="true">☆</span>
            路径二：智能识别
          </strong>
          <p>直接粘贴聊天记录、报价明细或邮件里的货物描述；系统会交给后端智能识别流程提取标准规格并返回可导入清单。</p>
        </div>
        <div class="recognition-actions">
          <button type="button" @click="fillRecognitionSample">套用示例</button>
          <button type="button" @click="clearRecognition">清空</button>
          <button class="primary" type="button" :disabled="!recognitionText.trim() || recognitionAgentBusy" @click="submitTextRecognitionTask">
            <span class="hollow-star button-star" aria-hidden="true">☆</span>
            {{ recognitionAgentBusy ? "智能识别中..." : "智能识别" }}
          </button>
        </div>
      </div>
      <textarea
        v-model="recognitionText"
        @input="resetRecognitionResult"
        rows="10"
        placeholder="例如：
蝶阀100 110*45*82cm 8件 单重180kg 木箱
纸箱B 60*40*35cm 30件 单重12kg
易碎品C 55×45×30cm 12件 单重18kg 不可重压"
      ></textarea>

      <div v-if="recognitionAgentBusy" class="recognition-loading-panel">
        <span class="recognition-loader"></span>
        <div>
          <strong>正在智能识别货物信息</strong>
          <p>后端会提取货物名称、型号、尺寸、数量、重量和备注，完成后自动生成可导入清单。</p>
        </div>
      </div>

      <div v-if="recognitionMessage" class="recognition-placeholder" :class="{ error: recognitionMessageType === 'error' }">
        <span>{{ recognitionMessageType === "error" ? "需要处理" : "识别提示" }}</span>
        <strong>{{ recognitionMessage }}</strong>
      </div>

      <template v-if="recognitionHasResult">
        <div class="excel-summary-grid recognition-summary-grid">
          <div>
            <span>文本条目</span>
            <strong>{{ recognitionTotalRows }}</strong>
          </div>
          <div>
            <span>有效条目</span>
            <strong>{{ recognitionValidCount }}</strong>
          </div>
          <div>
            <span>异常条目</span>
            <strong>{{ recognitionIssues.length }}</strong>
          </div>
          <div>
            <span>聚合后货物</span>
            <strong>{{ recognitionRows.length }}</strong>
          </div>
          <div>
            <span>导入件数</span>
            <strong>{{ recognitionQuantity }}</strong>
          </div>
        </div>

        <div v-if="recognitionAgentTask" class="agent-status-row text-agent-status">
          <span>{{ recognitionAgentTask.taskNo }} · {{ recognitionAgentTask.agentNotes }}</span>
          <button type="button" :disabled="!recognitionAgentTask.id" @click="downloadRecognitionAgentResult">
            下载识别结果 Excel
          </button>
        </div>

        <div class="recognition-import-row">
          <label>
            <span>导入方式</span>
            <select v-model="importMode">
              <option value="replace">替换当前货物</option>
              <option value="append">追加到当前货物</option>
            </select>
          </label>
          <button class="primary" type="button" :disabled="!recognitionRows.length" @click="importRecognitionRows">
            导入 {{ recognitionRows.length }} 类 / {{ recognitionQuantity }} 件货物
          </button>
        </div>

        <div v-if="recognitionRows.length" class="template-table-wrap">
          <table class="template-table sample">
            <thead>
              <tr>
                <th>货物</th>
                <th>型号</th>
                <th>尺寸 cm</th>
                <th>数量</th>
                <th>单重 kg</th>
                <th>类型</th>
                <th>备注</th>
                <th>操作</th>
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
                  <button type="button" @click="openRecognitionEdit(cargo, index)">编辑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="recognitionIssues.length" class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>原文行</th>
                <th>问题</th>
                <th>建议名称</th>
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

    <div v-if="excelMode === 'manual' && workbook" class="template-grid">
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

    <div v-if="excelMode === 'manual' && preview" class="excel-preview-actions">
      <p v-if="unresolvedInvalidRows.length" class="excel-warning">
        有 {{ unresolvedInvalidRows.length }} 行未通过校验，导入时会跳过这些行。
      </p>
      <p v-else class="excel-ok">全部行已通过校验。</p>
      <button class="primary" type="button" :disabled="!approvedAggregated.length" @click="importPreview">
        导入 {{ approvedAggregated.length }} 类 / {{ approvedQuantity }} 件货物
      </button>
    </div>

    <div v-if="excelMode === 'manual' && preview" class="template-grid">
      <article class="algorithm-note">
        <strong>有效数据预览</strong>
        <div class="template-table-wrap">
          <table class="template-table sample">
            <thead>
              <tr>
                <th>货物</th>
                <th>型号</th>
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
                <td>{{ cargo.model || "-" }}</td>
                <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                <td>{{ cargo.quantity }}</td>
                <td>{{ cargo.weightKg }}</td>
                <td>{{ typeText(cargo.type) }}</td>
                <td>{{ cargo.remark || "-" }}</td>
              </tr>
              <tr v-if="approvedAggregated.length > 12">
                <td colspan="7">还有 {{ approvedAggregated.length - 12 }} 类货物未显示</td>
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

    <div v-if="excelMode === 'reference'" class="template-grid">
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
          <li><code>model</code>：可填写型号/规格；如果同名货物出现多种尺寸但没有型号，系统会自动补为“型号 A/B/C”。</li>
          <li><code>totalWeightKg</code>：如果没有单件重量，可以用总重量除以数量自动换算。</li>
          <li>重复 SKU 或同规格同名称货物会先聚合数量，再写入当前货物列表。</li>
        </ul>
      </article>
    </div>

    <div v-if="excelMode === 'reference'" class="algorithm-note">
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

    <div v-if="excelMode === 'reference'" class="algorithm-note">
      <strong>智能识别的位置</strong>
      <p>
        表格文件继续走本地确定性规则完成解析、校验、单位换算和预览。粘贴文本则走后端智能识别流程，
        由模型提取货物名称、型号、尺寸、数量、重量和备注，最终导入仍然由用户确认。
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
            <span>型号/规格</span>
            <input v-model.trim="suggestionForm.model" />
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

    <div v-if="recognitionEditIndex >= 0" class="modal-backdrop">
      <div class="modal suggestion-modal recognition-edit-modal">
        <header>
          <div>
            <p>识别结果第 {{ recognitionEditIndex + 1 }} 条</p>
            <h2>编辑识别货物</h2>
          </div>
          <button type="button" @click="closeRecognitionEdit">×</button>
        </header>

        <div class="suggestion-summary">
          <strong>{{ recognitionEditSummary }}</strong>
          <ul>
            <li>这里修改的是导入前的识别结果，不会重新调用 Agent。</li>
            <li>适合修正重量千分位、型号、尺寸或货物类型。</li>
          </ul>
        </div>

        <div class="suggestion-form-grid">
          <label>
            <span>货物名称</span>
            <input v-model.trim="recognitionEditForm.name" />
          </label>
          <label>
            <span>型号/规格</span>
            <input v-model.trim="recognitionEditForm.model" />
          </label>
          <label>
            <span>长度 cm</span>
            <input v-model.number="recognitionEditForm.lengthCm" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>宽度 cm</span>
            <input v-model.number="recognitionEditForm.widthCm" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>高度 cm</span>
            <input v-model.number="recognitionEditForm.heightCm" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>数量</span>
            <input v-model.number="recognitionEditForm.quantity" type="number" min="1" step="1" />
          </label>
          <label>
            <span>单件重量 kg</span>
            <input v-model.number="recognitionEditForm.weightKg" type="number" min="0" step="0.01" />
          </label>
          <label>
            <span>类型</span>
            <select v-model="recognitionEditForm.type">
              <option value="normal">普通货物</option>
              <option value="upright">保持朝上</option>
              <option value="nonstack">不可重压</option>
              <option value="pallet">托盘/木箱</option>
            </select>
          </label>
          <label>
            <span>备注</span>
            <input v-model.trim="recognitionEditForm.remark" />
          </label>
        </div>

        <p v-if="recognitionEditErrors.length" class="excel-warning suggestion-error">
          还需要修改：{{ recognitionEditErrors.join("；") }}
        </p>

        <div class="modal-actions">
          <button type="button" @click="closeRecognitionEdit">取消</button>
          <button class="primary" type="button" @click="applyRecognitionEdit">保存到识别结果</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import {
  aggregateCargos,
  buildPreview,
  downloadTemplateWorkbook,
  importFields,
  readWorkbook,
  validateCargo
} from "../services/excelImport";
import {
  createTextRecognitionTask,
  downloadTextRecognitionExcel,
  fetchTextRecognitionTask
} from "../services/excelAgentApi";
import { uid } from "../utils/format";

const emit = defineEmits(["import-cargos"]);

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
const importMode = ref("replace");
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

async function handleFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  workbook.value = await readWorkbook(file);
  selectedSheetName.value = workbook.value.sheets[0]?.name || "";
  selectSheet();
}

function switchExcelMode(mode) {
  excelMode.value = mode === "agent" ? "recognition" : mode;
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
  recognitionText.value = [
    "蝶阀100 110*45*82cm 8件 单重180kg 木箱",
    "蝶阀200 125*55*90cm 4件 总重960kg 木箱",
    "纸箱B 60*40*35cm 30件 单重12kg",
    "易碎品C 55×45×30cm 12件 单重18kg 不可重压",
    "电子产品配件 型号K 长48.5cm 宽15cm 高11.7cm 数量1 单重1.2kg 朝上",
    "",
    "cargo:",
    "E-Houses",
    "2 skids – each 31.200 kgs / 1080 x 200 x 340 cm",
    "3 skids – each 18.100 kgs / 660 x 200 x 340 cm",
    "2 skids – each 33.700 kgs / 1.210 x 230 x 340 cm"
  ].join("\n");
  recognitionPreview.value = null;
  recognitionAgentTask.value = null;
  closeRecognitionEdit();
  recognitionMessage.value = "已填入示例文本，点击智能识别后会由后端流程提取中文和英文 skid 明细。";
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
    color: cargo.color || colors[index % colors.length]
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
    remark: cargo.remark || ""
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
    remark: String(recognitionEditForm.remark || "").trim()
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
    normal: "普通货物",
    upright: "保持朝上",
    nonstack: "不可重压",
    pallet: "托盘/木箱"
  }[type] || "普通货物";
}

function suggestionCargoLabel(cargo) {
  if (!cargo?.name) return "-";
  return cargo.model ? `${cargo.name} ${cargo.model}` : cargo.name;
}

function cargoKey(cargo, index = "") {
  return `${index}-${cargo.name}-${cargo.lengthCm}-${cargo.widthCm}-${cargo.heightCm}-${cargo.quantity}-${cargo.weightKg}-${cargo.type}`;
}
</script>
