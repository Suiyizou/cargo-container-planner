<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">CP</span>
        <div>
          <p>Browser / Server</p>
          <h1>货代装箱体积规划系统</h1>
        </div>
      </div>
      <div class="top-user">
        <span>{{ pageTitle }}</span>
        <strong>{{ userDisplayName }}</strong>
      </div>
    </header>

    <div class="app-body" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <aside class="app-sidebar">
        <button class="sidebar-toggle" type="button" @click="sidebarCollapsed = !sidebarCollapsed">
          <span>{{ sidebarCollapsed ? "展开" : "收起" }}</span>
          <b>{{ sidebarCollapsed ? "›" : "‹" }}</b>
        </button>

        <div class="side-user-card">
          <span>当前工作区</span>
          <strong>{{ userDisplayName }}</strong>
          <small>{{ cargos.length }} 类货物 · {{ containers.length }} 个箱型</small>
        </div>

        <nav class="side-nav">
          <RouterLink to="/home" :class="{ active: activePage === 'home' }">
            <span class="nav-full">工作台首页</span>
            <span class="nav-short">首页</span>
          </RouterLink>
          <RouterLink to="/planner/config" :class="{ active: activePage === 'planner' }">
            <span class="nav-full">装箱计算</span>
            <span class="nav-short">装箱</span>
          </RouterLink>
          <div v-if="activePage === 'planner'" class="side-subnav">
            <RouterLink to="/planner/config" :class="{ active: plannerMode === 'config' }">计算配置</RouterLink>
            <RouterLink to="/planner/cargos" :class="{ active: plannerMode === 'cargos' }">货物总览</RouterLink>
            <RouterLink to="/planner/results" :class="{ active: plannerMode === 'results' }">计算结果</RouterLink>
          </div>
          <RouterLink to="/smart-import" :class="{ active: activePage === 'smart-import' }">
            <span class="nav-full">智能导入</span>
            <span class="nav-short">导入</span>
          </RouterLink>
          <RouterLink to="/algorithm" :class="{ active: activePage === 'algorithm' }">
            <span class="nav-full">算法说明</span>
            <span class="nav-short">算法</span>
          </RouterLink>
          <RouterLink to="/admin" :class="{ active: activePage === 'admin' }">
            <span class="nav-full">管理后台</span>
            <span class="nav-short">后台</span>
          </RouterLink>
        </nav>

      </aside>

      <section class="workspace">

    <Transition name="page-switch" mode="out-in">
    <HomePage
      v-if="activePage === 'home'"
      key="home"
      :cargo-count="cargos.length"
      :utilization-percent="utilizationPercent"
      :global-gap-cm="globalGapCm"
      @save-settings="applyUserSettings"
    />
    <main v-else-if="activePage === 'planner'" :key="`planner-${plannerMode}`" class="planner-page">
      <section v-if="plannerMode === 'config'" class="planner-section">
        <div class="planner-page-head">
          <div>
            <p>Calculation Setup</p>
            <h2>计算配置</h2>
          </div>
          <span class="status-pill" :class="{ warn: loading }">{{ apiStatus }}</span>
        </div>

        <div class="planner-config-grid">
          <article class="planner-card">
            <div class="step-title">
              <span>1</span>
              <strong>装箱参数</strong>
            </div>
            <label class="range-row">
              <span>计划可用率 <b>{{ utilizationPercent }}%</b></span>
              <input v-model.number="utilizationPercent" type="range" min="75" max="98" />
            </label>
            <label class="range-row">
              <span>货物间隙 <b>{{ globalGapCm }} cm</b></span>
              <input v-model.number="globalGapCm" type="range" min="0" max="8" />
            </label>
            <div class="planner-action-row">
              <button class="primary" type="button" @click="openCargoModal()">手动录入货物</button>
              <RouterLink class="planner-link-button" to="/planner/cargos">查看货物总览</RouterLink>
            </div>
            <div class="config-toolbox">
              <strong>常用工具</strong>
              <div class="config-tool-grid">
                <button type="button" @click="openContainerModal">添加箱型</button>
                <button type="button" @click="loadSample">套用示例</button>
                <button type="button" @click="exportCsv">导出 CSV</button>
                <label>导入 CSV<input type="file" accept=".csv,text/csv" @change="importCsv" /></label>
                <button type="button" @click="resetContainers">恢复默认箱型</button>
                <button class="danger ghost" type="button" @click="clearCargos">清空货物</button>
              </div>
            </div>
          </article>

          <article class="planner-card">
            <div class="step-title">
              <span>2</span>
              <strong>模板货物栏</strong>
            </div>
            <p class="planner-muted">这里预留企业长期货物模板入口，后续可以连接数据库，把常用 SKU 一键加入当前计划。</p>
            <div class="template-placeholder-grid">
              <button type="button" @click="loadSample">套用示例货物</button>
              <button type="button" disabled>从数据库选择</button>
              <button type="button" disabled>保存为模板</button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="plannerMode === 'cargos'" class="planner-section">
        <div class="planner-page-head">
          <div>
            <p>Cargo Overview</p>
            <h2>货物总览</h2>
          </div>
          <button class="primary" type="button" @click="openCargoModal()">新增货物</button>
        </div>

        <div class="planner-metrics">
          <div><span>货物种类</span><strong>{{ cargoTypeCount }}</strong></div>
          <div><span>总件数</span><strong>{{ cargoTotalQuantity }}</strong></div>
          <div><span>总质量</span><strong>{{ fmt(cargoTotalWeightKg / 1000, 2) }} t</strong></div>
          <div><span>总体积</span><strong>{{ fmt(cargoTotalVolumeM3, 2) }} m³</strong></div>
        </div>

        <section class="panel cargo-overview-panel">
          <div class="section-head">
            <div>
              <p>Current Cargo</p>
              <h2>当前货物列表</h2>
            </div>
            <RouterLink class="planner-link-button" to="/planner/results">查看计算结果</RouterLink>
          </div>
          <div v-if="cargos.length" class="cargo-overview-table-wrap">
            <table class="cargo-overview-table">
              <thead>
                <tr>
                  <th>货物</th>
                  <th>型号</th>
                  <th>尺寸 cm</th>
                  <th>数量</th>
                  <th>单重</th>
                  <th>小计体积</th>
                  <th>类型</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(cargo, index) in cargos" :key="cargo.id">
                  <td>
                    <span class="cargo-name-cell">
                      <i :style="{ background: cargo.color || systemColorFor(index) }"></i>
                      <b>{{ cargo.name }}</b>
                    </span>
                  </td>
                  <td>{{ cargo.model || "-" }}</td>
                  <td>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }}</td>
                  <td>{{ cargo.quantity }} 件</td>
                  <td>{{ fmt(cargo.weightKg, 2) }} kg</td>
                  <td>{{ fmt((cargo.lengthCm * cargo.widthCm * cargo.heightCm * cargo.quantity) / 1000000, 3) }} m³</td>
                  <td>{{ cargoTypeText(cargo.type) }}</td>
                  <td>
                    <div class="table-actions">
                      <button type="button" @click="openCargoModal(cargo)">详情/编辑</button>
                      <button class="danger ghost" type="button" @click="deleteCargo(cargo.id, cargo.name)">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty">还没有录入货物，可以先手动新增，或去智能导入页面导入表格。</p>
        </section>
      </section>

      <section v-else class="planner-section">
        <section class="panel ranking-panel">
          <div class="section-head">
            <div>
              <p>箱型选择</p>
              <h2>推荐箱型对比</h2>
            </div>
            <div class="view-actions">
              <span class="status-pill" :class="{ warn: loading }">{{ apiStatus }}</span>
              <button type="button" @click="recalculate">重新计算</button>
            </div>
          </div>
          <div class="box-switch" v-if="selectedEvaluation?.packedBoxes?.length > 1">
            <span>{{ selectedEvaluation?.estimatedBoxes ? "显示已详算货舱" : "显示货舱" }}</span>
            <button
              v-for="box in selectedEvaluation.packedBoxes"
              :key="box.index"
              :class="{ active: selectedBoxIndex === box.index }"
              type="button"
              @click="switchBox(box.index)"
            >
              {{ box.index }}
            </button>
          </div>
          <div class="container-grid">
            <button
              v-for="evaluation in sortedEvaluations"
              :key="evaluation.container.id"
              :class="{ active: selectedContainerId === evaluation.container.id, best: result?.bestContainerId === evaluation.container.id }"
              class="container-card"
              type="button"
              @click="selectContainer(evaluation.container.id)"
            >
              <span class="container-icon">{{ containerIcon(evaluation.container.name) }}</span>
              <strong>{{ evaluation.container.name }}</strong>
              <small>{{ evaluation.container.lengthCm }} × {{ evaluation.container.widthCm }} × {{ evaluation.container.heightCm }} cm</small>
              <b>{{ evaluation.boxes > 0 ? `${evaluation.estimatedBoxes ? "约 " : ""}${evaluation.boxes} 箱` : "不可装" }}</b>
              <em>占用率 {{ fmt(evaluation.firstBoxFillPercent, 1) }}%</em>
            </button>
          </div>
        </section>

        <section class="panel visual-panel">
          <div class="section-head">
            <div>
              <p>物理摆放视图</p>
              <h2>{{ selectedContainer?.name || "请选择箱型" }} · 第 {{ selectedBoxIndex }} 货舱</h2>
            </div>
            <div class="view-actions">
              <label><input v-model="showRemaining" type="checkbox" /> 显示剩余空间</label>
              <label><input v-model="showMassBalance" type="checkbox" /> 显示重心偏载</label>
              <button type="button" :disabled="exportingReport || loading || !selectedPlacements.length" @click="exportCurrentReport('png')">导出图片</button>
              <button type="button" :disabled="exportingReport || loading || !selectedPlacements.length" @click="exportCurrentReport('pdf')">导出 PDF</button>
            </div>
          </div>
          <div class="scene-wrap">
            <ContainerScene
              :container="selectedContainer"
              :placements="selectedPlacements"
              :show-remaining="showRemaining"
              :show-mass-balance="showMassBalance"
              :busy="loading"
            />
            <div v-if="loading || switchingBox" class="loading-mask">
              <div class="spinner"></div>
              <span>{{ switchingBox ? "正在切换货舱视图..." : "正在计算装箱结果..." }}</span>
            </div>
          </div>
        </section>

        <section class="projection-grid">
          <ProjectionCanvas title="俯视图：长 × 宽" note="看底面铺放" mode="top" :container="selectedContainer" :placements="selectedPlacements" />
          <ProjectionCanvas title="正视图：长 × 高" note="看长度方向堆叠" mode="front" :container="selectedContainer" :placements="selectedPlacements" />
          <ProjectionCanvas title="侧视图：宽 × 高" note="看宽度方向堆叠" mode="side" :container="selectedContainer" :placements="selectedPlacements" />
        </section>
      </section>
    </main>

    <AlgorithmPage
      v-else-if="activePage === 'algorithm'"
      key="algorithm"
      :evaluation="selectedEvaluation"
    />
    <ExcelTemplatePage v-else-if="activePage === 'smart-import'" key="smart-import" @import-cargos="importExcelCargos" />
    <AdminDashboard v-else-if="activePage === 'admin'" key="admin" />
    </Transition>
      </section>
    </div>

    <CargoModal v-if="cargoModalOpen" :cargo="editingCargo" @close="closeCargoModal" @save="saveCargo" />
    <ContainerModal v-if="containerModalOpen" @close="containerModalOpen = false" @save="saveContainer" />
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminDashboard from "./components/AdminDashboard.vue";
import AlgorithmPage from "./components/AlgorithmPage.vue";
import ExcelTemplatePage from "./components/ExcelTemplatePage.vue";
import HomePage from "./components/HomePage.vue";
import CargoModal from "./components/CargoModal.vue";
import ContainerModal from "./components/ContainerModal.vue";
import ContainerScene from "./components/ContainerScene.vue";
import ProjectionCanvas from "./components/ProjectionCanvas.vue";
import { exportPackingReport } from "./services/exportReport";
import { assignCargoModels } from "./services/excelImport";
import { calculatePacking } from "./services/packingClient";
import { cloneDefaultContainers } from "./services/localData";
import { cargoLabel, fmt, shortType, uid } from "./utils/format";

const STORAGE_KEY = "cargo-planner-vue-state";
const colors = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];

const route = useRoute();
const router = useRouter();
const profileVersion = ref(0);
const sidebarCollapsed = ref(false);
const routeName = computed(() => String(route.name || ""));
const activePage = computed(() => {
  if (routeName.value.startsWith("planner")) return "planner";
  return routeName.value || "home";
});
const plannerMode = computed(() => {
  if (routeName.value === "planner-cargos") return "cargos";
  if (routeName.value === "planner-results") return "results";
  return "config";
});
const pageTitle = computed(() => ({
  home: "工作台首页",
  planner: "装箱计算",
  algorithm: "算法说明",
  "smart-import": "智能导入",
  admin: "管理后台"
}[activePage.value] || "工作台"));
const userDisplayName = computed(() => {
  profileVersion.value;
  try {
    const profile = JSON.parse(localStorage.getItem("cargo-planner-user-profile") || "{}");
    return profile.displayName || "操作员";
  } catch {
    return "操作员";
  }
});
const cargos = ref([]);
const containers = ref([]);
const result = ref(null);
const selectedContainerId = ref("");
const selectedBoxIndex = ref(1);
const utilizationPercent = ref(90);
const globalGapCm = ref(1);
const loading = ref(false);
const switchingBox = ref(false);
const showRemaining = ref(true);
const showMassBalance = ref(true);
const cargoModalOpen = ref(false);
const containerModalOpen = ref(false);
const editingCargo = ref(null);
const exportingReport = ref(false);
const toast = ref("");
const apiStatus = ref("本机计算");

let timer = 0;
let calcSeq = 0;

const sortedEvaluations = computed(() => result.value?.evaluations || []);
const selectedEvaluation = computed(() => {
  if (!sortedEvaluations.value.length) return null;
  return sortedEvaluations.value.find((item) => item.container.id === selectedContainerId.value) || sortedEvaluations.value[0];
});
const selectedContainer = computed(() => selectedEvaluation.value?.container || containers.value[0] || null);
const selectedBox = computed(() => {
  const boxes = selectedEvaluation.value?.packedBoxes || [];
  return boxes.find((box) => box.index === selectedBoxIndex.value) || boxes[0] || { placed: [] };
});
const selectedPlacements = computed(() =>
  (selectedBox.value.placed || []).map((item) => ({ ...item, type: shortType(item.type) }))
);
const cargoTypeCount = computed(() => cargos.value.length);
const cargoTotalQuantity = computed(() =>
  cargos.value.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0)
);
const cargoTotalWeightKg = computed(() =>
  cargos.value.reduce((sum, cargo) => sum + Number(cargo.weightKg || 0) * Number(cargo.quantity || 0), 0)
);
const cargoTotalVolumeM3 = computed(() =>
  cargos.value.reduce((sum, cargo) =>
    sum + Number(cargo.lengthCm || 0) * Number(cargo.widthCm || 0) * Number(cargo.heightCm || 0) * Number(cargo.quantity || 0) / 1000000,
  0)
);

onMounted(async () => {
  restoreState();
  cargos.value = normalizeCargoModels(cargos.value);
  if (!containers.value.length) containers.value = cloneDefaultContainers();
  if (!selectedContainerId.value && containers.value[0]) selectedContainerId.value = containers.value[0].id;
  if (!cargos.value.length) loadSample(false);
  recalculate();
});

watch([cargos, containers, utilizationPercent, globalGapCm], () => {
  persistState();
  window.clearTimeout(timer);
  timer = window.setTimeout(recalculate, 400);
}, { deep: true });

watch([showRemaining, showMassBalance], persistState);

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    cargos.value = saved.cargos || [];
    containers.value = saved.containers || [];
    utilizationPercent.value = saved.utilizationPercent || 90;
    globalGapCm.value = saved.globalGapCm ?? 1;
    showRemaining.value = saved.showRemaining ?? true;
    showMassBalance.value = saved.showMassBalance ?? true;
    selectedContainerId.value = saved.selectedContainerId || "";
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    cargos: cargos.value,
    containers: containers.value,
    utilizationPercent: utilizationPercent.value,
    globalGapCm: globalGapCm.value,
    showRemaining: showRemaining.value,
    showMassBalance: showMassBalance.value,
    selectedContainerId: selectedContainerId.value
  }));
}

async function recalculate() {
  if (!cargos.value.length || !containers.value.length) return;
  const seq = ++calcSeq;
  loading.value = true;
  apiStatus.value = "正在计算";
  try {
    const nextResult = await calculatePacking({
      cargos: cargos.value,
      containers: containers.value,
      utilizationPercent: utilizationPercent.value,
      globalGapCm: globalGapCm.value
    });
    if (seq !== calcSeq) return;
    result.value = normalizeResult(nextResult);
    apiStatus.value = "本机计算";
    selectedContainerId.value = result.value.bestContainerId || result.value.evaluations[0]?.container.id || selectedContainerId.value;
    selectedBoxIndex.value = 1;
  } catch (error) {
    apiStatus.value = "计算异常";
    showToast(error.message || "本机计算失败，请检查货物参数。");
  } finally {
    if (seq === calcSeq) loading.value = false;
  }
}

function normalizeResult(nextResult) {
  const evaluations = [...(nextResult?.evaluations || [])].sort((a, b) => {
    if (a.fatalOversize !== b.fatalOversize) return a.fatalOversize ? 1 : -1;
    if (a.boxes !== b.boxes) return a.boxes - b.boxes;
    return b.firstBoxFillPercent - a.firstBoxFillPercent;
  });
  return { ...nextResult, evaluations };
}

function selectContainer(id) {
  selectedContainerId.value = id;
  selectedBoxIndex.value = 1;
  persistState();
}

async function switchBox(index) {
  switchingBox.value = true;
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  selectedBoxIndex.value = index;
  switchingBox.value = false;
}

function openCargoModal(cargo = null) {
  editingCargo.value = cargo ? { ...cargo } : null;
  cargoModalOpen.value = true;
}

function closeCargoModal() {
  cargoModalOpen.value = false;
  editingCargo.value = null;
}

function saveCargo(cargo) {
  const index = cargos.value.findIndex((item) => item.id === cargo.id);
  if (index >= 0) cargos.value.splice(index, 1, cargo);
  else cargos.value.push(cargo);
  cargos.value = normalizeCargoModels(cargos.value);
  closeCargoModal();
}

function deleteCargo(id, name) {
  if (!window.confirm(`确认删除「${name}」吗？`)) return;
  cargos.value = cargos.value.filter((item) => item.id !== id);
  if (!cargos.value.length) result.value = null;
  showToast("已删除货物。");
}

function openContainerModal() {
  containerModalOpen.value = true;
}

function saveContainer(container) {
  containers.value.push(container);
  selectedContainerId.value = container.id;
  containerModalOpen.value = false;
}

function resetContainers() {
  containers.value = cloneDefaultContainers();
  selectedContainerId.value = containers.value[0]?.id || "";
  showToast("已恢复默认箱型。");
}

function applyUserSettings(settings) {
  utilizationPercent.value = Number(settings.utilizationPercent || utilizationPercent.value);
  globalGapCm.value = Number(settings.globalGapCm ?? globalGapCm.value);
  profileVersion.value += 1;
  persistState();
  showToast("个人偏好已应用。");
}

function loadSample(notify = true) {
  cargos.value = [
    { id: uid("cargo"), name: "蝶阀木箱 A", lengthCm: 110, widthCm: 45, heightCm: 82, quantity: 8, weightKg: 180, type: "pallet", color: systemColorFor(0) },
    { id: uid("cargo"), name: "纸箱 B", lengthCm: 60, widthCm: 40, heightCm: 35, quantity: 30, weightKg: 12, type: "normal", color: systemColorFor(1) },
    { id: uid("cargo"), name: "易碎品 C", lengthCm: 55, widthCm: 45, heightCm: 30, quantity: 12, weightKg: 18, type: "nonstack", color: systemColorFor(2) }
  ];
  if (notify) showToast("已套用示例货物。");
}

function clearCargos() {
  cargos.value = [];
  result.value = null;
  showToast("已清空货物。");
}

function exportCsv() {
  const header = ["name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color"];
  const rows = cargos.value.map((cargo) => header.map((key) => cargo[key]).join(","));
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cargo-list.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCurrentReport(format) {
  if (!selectedContainer.value || !selectedPlacements.value.length) {
    showToast("当前没有可导出的摆放结果。");
    return;
  }
  exportingReport.value = true;
  showToast(format === "pdf" ? "正在生成 PDF 报告..." : "正在生成剖析图片...");
  try {
    await exportPackingReport({
      format,
      container: selectedContainer.value,
      evaluation: selectedEvaluation.value,
      placements: selectedPlacements.value,
      cargos: cargos.value,
      boxIndex: selectedBoxIndex.value,
      utilizationPercent: utilizationPercent.value,
      globalGapCm: globalGapCm.value,
      showMassBalance: showMassBalance.value
    });
    showToast(format === "pdf" ? "PDF 已导出。" : "图片已导出。");
  } catch (error) {
    showToast(error.message || "导出失败，请稍后重试。");
  } finally {
    exportingReport.value = false;
  }
}

function importCsv(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result || "").split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.split(",") || [];
    cargos.value = lines.map((line, index) => {
      const values = line.split(",");
      const item = Object.fromEntries(header.map((key, i) => [key, values[i]]));
      return {
        id: uid("cargo"),
        name: item.name || `货物 ${index + 1}`,
        model: item.model || "",
        lengthCm: Number(item.lengthCm || 1),
        widthCm: Number(item.widthCm || 1),
        heightCm: Number(item.heightCm || 1),
        quantity: Number(item.quantity || 1),
        weightKg: Number(item.weightKg || 0),
        type: item.type || "normal",
        color: item.color || ""
      };
    });
    cargos.value = normalizeCargoModels(cargos.value);
    showToast("CSV 已导入。");
  };
  reader.readAsText(file, "utf-8");
  event.target.value = "";
}

function containerIcon(name) {
  if (name.includes("RF") || name.includes("冷藏")) return "RF";
  if (name.includes("45")) return "45";
  if (name.includes("40")) return "40";
  return "20";
}

function importExcelCargos({ cargos: importedCargos, mode, skippedRows = 0 }) {
  if (!importedCargos?.length) return;
  cargos.value = normalizeCargoModels(mode === "append" ? [...cargos.value, ...importedCargos] : importedCargos);
  result.value = null;
  selectedBoxIndex.value = 1;
  router.push("/planner/cargos");
  showToast(`${mode === "append" ? "已追加" : "已导入"} ${importedCargos.length} 类货物${skippedRows ? `，跳过 ${skippedRows} 行异常数据` : ""}`);
}

function systemColorFor(index) {
  return colors[index % colors.length];
}

function cargoDisplayName(cargo) {
  return cargoLabel(cargo);
}

function cargoTypeText(type) {
  return {
    normal: "普通货物",
    upright: "保持朝上",
    nonstack: "不可重压",
    pallet: "托盘/木箱"
  }[type] || "普通货物";
}

function normalizeCargoModels(items) {
  return assignCargoModels(items);
}

function showToast(message) {
  toast.value = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => (toast.value = ""), 2200);
}
</script>
