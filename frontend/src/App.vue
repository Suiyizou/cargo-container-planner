<template>
  <LoginPage v-if="authChecked && !currentUser" @logged-in="handleLoggedIn" />
  <div v-else-if="!authChecked" class="auth-loading-shell">
    <div class="spinner"></div>
    <span>正在检查登录状态...</span>
  </div>
  <AdminDashboard
    v-else-if="activePage === 'admin' && currentUser?.role === 'ADMIN'"
    key="admin"
    :current-user="currentUser"
    @logout="handleLogout"
    @user-updated="handleUserUpdated"
  />
  <div v-else class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">CP</span>
        <div>
          <p>Browser / Server</p>
          <h1>货代装箱体积规划系统</h1>
        </div>
      </div>
      <el-breadcrumb separator="/" class="top-breadcrumb">
        <el-breadcrumb-item>工作台</el-breadcrumb-item>
        <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
        <el-breadcrumb-item v-if="activePage === 'planner'">{{ activePlannerStepLabel }}</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="top-user">
        <el-tag effect="plain" type="primary">{{ pageTitle }}</el-tag>
        <el-button type="primary" plain class="user-button" @click="profileOpen = true">
          <strong>{{ userDisplayName }}</strong>
          <small>{{ currentUser?.username }}</small>
        </el-button>
      </div>
    </header>

    <div class="app-body" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <aside class="app-sidebar">
        <el-button class="sidebar-toggle" :icon="sidebarCollapsed ? Expand : Fold" @click="sidebarCollapsed = !sidebarCollapsed">
          <span>{{ sidebarCollapsed ? "展开" : "收起" }}</span>
        </el-button>

        <div class="side-user-card">
          <span>当前工作区</span>
          <strong>{{ userDisplayName }}</strong>
          <small>{{ cargos.length }} 类货物 · {{ containers.length }} 个箱型</small>
        </div>

        <el-menu
          class="side-menu"
          :collapse="sidebarCollapsed"
          :default-active="activeMenuIndex"
          background-color="transparent"
          text-color="#24415f"
          active-text-color="#165DFF"
          @select="handleMenuSelect"
        >
          <el-menu-item index="/home">
            <el-icon><House /></el-icon>
            <span>工作台首页</span>
          </el-menu-item>
          <el-sub-menu index="/planner">
            <template #title>
              <el-icon><Box /></el-icon>
              <span>装箱计算</span>
            </template>
            <el-menu-item index="/planner/config">
              <el-icon><Setting /></el-icon>
              <span>01 配置与货物管理</span>
            </el-menu-item>
            <el-menu-item index="/planner/results" :disabled="!cargos.length">
              <el-icon><DataAnalysis /></el-icon>
              <span>02 计算方案</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item index="/algorithm">
            <el-icon><Document /></el-icon>
            <span>算法说明</span>
          </el-menu-item>
        </el-menu>

      </aside>

      <section class="workspace">

    <Transition name="page-switch" mode="out-in">
    <HomePage
      v-if="activePage === 'home'"
      key="home"
      :user="currentUser"
      :cargo-count="cargos.length"
      :utilization-percent="utilizationPercent"
      :global-gap-cm="globalGapCm"
      @save-settings="applyUserSettings"
    />
    <main v-else-if="activePage === 'planner'" key="planner" class="planner-page">
      <el-card class="planner-step-card" shadow="never">
        <el-steps :active="activeStepIndex" finish-status="success" align-center>
          <el-step
            v-for="(step, index) in plannerWorkflowSteps"
            :key="step.key"
            :status="activePlannerStep === step.key ? 'process' : index < activeStepIndex ? 'success' : 'wait'"
          >
            <template #title>
              <el-button
                link
                :type="activePlannerStep === step.key ? 'primary' : 'default'"
                :disabled="step.disabled"
                class="step-title-button"
                @click="goPlannerStep(step.key)"
              >
                {{ step.no }} {{ step.label }}
              </el-button>
            </template>
            <template #description>
              <span class="step-description">{{ step.description }}</span>
            </template>
          </el-step>
        </el-steps>
      </el-card>

      <Transition name="planner-view" mode="out-in">
      <section v-if="plannerMode === 'config'" key="config-view" class="planner-section">
        <el-card class="planner-page-head" shadow="never">
          <div class="page-heading">
            <p>Calculation Setup</p>
            <h2>计算配置</h2>
          </div>
          <el-tag :type="loading ? 'warning' : 'primary'" effect="light">{{ apiStatus }}</el-tag>
        </el-card>
        <el-alert
          v-if="showPackingWorkloadHint"
          class="calculation-load-hint"
          :class="packingWorkloadHint.level"
          :title="packingWorkloadHint.title"
          :description="`${packingWorkloadHint.detail}。${packingWorkloadHint.advice}`"
          :type="packingWorkloadHint.level === 'heavy' ? 'error' : packingWorkloadHint.level === 'medium' ? 'warning' : 'info'"
          show-icon
          :closable="false"
        />

        <div class="planner-config-grid">
          <el-card class="planner-card" shadow="hover">
            <template #header>
              <div class="card-header-title">
                <el-icon><Operation /></el-icon>
                <strong>装箱参数</strong>
              </div>
            </template>
            <div class="slider-form">
              <div class="slider-row">
                <div>
                  <span class="field-label">计划可用率</span>
                  <el-tag type="primary" effect="light">{{ utilizationPercent }}%</el-tag>
                </div>
                <el-slider v-model="utilizationPercent" :min="75" :max="98" />
              </div>
              <div class="slider-row">
                <div>
                  <span class="field-label">货物间隙</span>
                  <el-tag type="info" effect="light">{{ globalGapCm }} cm</el-tag>
                </div>
                <el-slider v-model="globalGapCm" :min="0" :max="8" />
              </div>
            </div>
            <div class="planner-action-row">
              <el-button type="primary" :icon="Plus" @click="openCargoModal()">手动录入货物</el-button>
              <el-button :icon="Tickets" @click="goPlannerStep('cargos')">进入货物总览</el-button>
            </div>
            <el-divider />
            <div class="config-toolbox">
              <strong>常用工具</strong>
              <div class="config-tool-grid">
                <el-button :icon="Box" @click="openContainerModal">添加箱型</el-button>
                <el-button :icon="MagicStick" @click="loadSample">套用示例</el-button>
                <el-button :icon="Download" @click="exportCsv">导出 CSV</el-button>
                <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,text/csv" :on-change="handleCsvUpload">
                  <el-button :icon="Upload">导入 CSV</el-button>
                </el-upload>
                <el-button :icon="Refresh" @click="resetContainers">恢复默认箱型</el-button>
                <el-button type="danger" plain :icon="Delete" @click="clearCargos">清空货物</el-button>
              </div>
            </div>
          </el-card>

          <el-card class="planner-card" shadow="hover">
            <template #header>
              <div class="card-header-title">
                <el-icon><Files /></el-icon>
                <strong>模板货物栏</strong>
              </div>
            </template>
            <p class="planner-muted">先提供本机常用货物模板，后续接数据库后可升级为企业 SKU 模板库。</p>
            <div class="template-save-row">
              <el-input v-model.trim="templateName" placeholder="模板名称，例如：E-House 项目" clearable />
              <el-button type="primary" :disabled="!cargos.length" @click="saveCargoTemplate">保存当前为模板</el-button>
            </div>
            <el-table v-if="cargoTemplates.length" :data="cargoTemplates" size="small" class="template-table-lite" max-height="240">
              <el-table-column prop="name" label="模板名称" min-width="150" />
              <el-table-column label="规模" width="110">
                <template #default="{ row }">{{ row.cargos.length }} 类 / {{ templateQuantity(row) }} 件</template>
              </el-table-column>
              <el-table-column label="操作" width="96" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" type="primary" plain @click="applyCargoTemplate(row.id)">套用</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="还没有本机货物模板" :image-size="72" />
            <div class="template-placeholder-grid">
              <el-button :icon="MagicStick" @click="loadSample">套用示例货物</el-button>
              <el-button :icon="Delete" :disabled="!cargoTemplates.length" @click="deleteSelectedCargoTemplate">删除最近模板</el-button>
            </div>
          </el-card>
        </div>
      </section>

      <section v-else-if="plannerMode === 'cargos'" key="cargo-detail-view" class="planner-section">
        <el-card class="planner-page-head" shadow="never">
          <div class="page-heading">
            <p>Cargo Overview</p>
            <h2>货物总览</h2>
          </div>
          <div class="section-actions">
            <el-button :icon="ArrowLeft" @click="goPlannerStep('config')">返回配置</el-button>
          </div>
        </el-card>

        <div class="planner-metrics">
          <el-card shadow="never"><el-statistic title="货物品类数" :value="cargoTypeCount" /></el-card>
          <el-card shadow="never"><el-statistic title="总件数" :value="cargoTotalQuantity" /></el-card>
          <el-card shadow="never"><el-statistic title="总重量" :value="cargoTotalWeightKg / 1000" :precision="2" suffix="t" /></el-card>
          <el-card shadow="never"><el-statistic title="总体积" :value="cargoTotalVolumeM3" :precision="2" suffix="m³" /></el-card>
        </div>
        <el-alert
          v-if="showPackingWorkloadHint"
          class="calculation-load-hint compact"
          :class="packingWorkloadHint.level"
          :title="packingWorkloadHint.title"
          :description="`${packingWorkloadHint.detail}。${packingWorkloadHint.advice}`"
          :type="packingWorkloadHint.level === 'heavy' ? 'error' : packingWorkloadHint.level === 'medium' ? 'warning' : 'info'"
          show-icon
          :closable="false"
        />

        <el-card class="panel cargo-overview-panel" shadow="never">
          <template #header>
          <div class="section-head">
            <div>
              <p>Current Cargo</p>
              <h2>当前货物列表</h2>
            </div>
            <div class="section-actions cargo-list-actions">
              <el-button type="primary" :icon="Plus" @click="openCargoModal()">手动录入</el-button>
              <el-button :icon="Star" @click="smartImportOpen = !smartImportOpen">{{ smartImportOpen ? "收起智能导入" : "智能导入" }}</el-button>
              <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,text/csv" :on-change="handleCsvUpload">
                <el-button :icon="Upload">导入 CSV</el-button>
              </el-upload>
              <el-button :icon="Delete" :disabled="!selectedCargoRows.length" @click="deleteSelectedCargos">批量删除</el-button>
              <el-button type="danger" plain :icon="Delete" :disabled="!cargos.length" @click="clearCargos">清空全部</el-button>
              <el-button type="primary" :disabled="!cargos.length" @click="goPlannerStep('results')">进入计算方案</el-button>
            </div>
          </div>
          </template>
          <el-collapse-transition>
            <div v-if="smartImportOpen" class="embedded-smart-import">
              <ExcelTemplatePage key="embedded-smart-import" @import-cargos="importExcelCargos" />
            </div>
          </el-collapse-transition>
          <el-table
            v-if="cargos.length"
            :data="cargos"
            row-key="id"
            class="cargo-overview-table"
            size="large"
            @selection-change="handleCargoSelectionChange"
          >
            <el-table-column type="selection" width="44" />
            <el-table-column label="货物" min-width="180">
              <template #default="{ row, $index }">
                <span class="cargo-name-cell">
                  <i :style="{ background: row.color || systemColorFor($index) }"></i>
                  <b>{{ row.name }}</b>
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="model" label="型号" min-width="110">
              <template #default="{ row }">{{ row.model || "-" }}</template>
            </el-table-column>
            <el-table-column label="尺寸 cm" min-width="170">
              <template #default="{ row }">{{ row.lengthCm }} × {{ row.widthCm }} × {{ row.heightCm }}</template>
            </el-table-column>
            <el-table-column label="数量" width="150">
              <template #default="{ row }">
                <el-input-number v-model="row.quantity" :min="1" :step="1" size="small" controls-position="right" @change="touchCargoList" />
              </template>
            </el-table-column>
            <el-table-column label="单重" width="110">
              <template #default="{ row }">{{ fmt(row.weightKg, 2) }} kg</template>
            </el-table-column>
            <el-table-column label="小计体积" width="130">
              <template #default="{ row }">{{ fmt((row.lengthCm * row.widthCm * row.heightCm * row.quantity) / 1000000, 3) }} m³</template>
            </el-table-column>
            <el-table-column label="类型" width="120">
              <template #default="{ row }">
                <el-tag effect="plain">{{ cargoTypeText(row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openCargoModal(row)">编辑</el-button>
                <el-button link type="danger" @click="deleteCargo(row.id, row.name)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="还没有录入货物，可以先手动新增，或使用上方智能导入/CSV 导入表格。" />
        </el-card>
      </section>

      <section v-else key="results-view" class="planner-section">
        <section class="panel ranking-panel">
          <div class="section-head">
            <div>
              <p>箱型选择</p>
              <h2>推荐箱型对比</h2>
            </div>
            <div class="view-actions">
              <el-tag :type="loading ? 'warning' : 'primary'" effect="light">{{ apiStatus }}</el-tag>
              <el-button :icon="ArrowLeft" @click="goPlannerStep('cargos')">返回货物总览</el-button>
              <el-button :icon="Refresh" @click="recalculate">重新计算</el-button>
            </div>
          </div>
          <div class="box-switch" v-if="selectedEvaluation?.packedBoxes?.length > 1">
            <span>{{ boxSwitchLabel }}</span>
            <el-button
              v-for="box in selectedEvaluation.packedBoxes"
              :key="box.index"
              :class="{ active: selectedBoxIndex === box.index }"
              size="small"
              :type="selectedBoxIndex === box.index ? 'primary' : 'default'"
              @click="switchBox(box.index)"
            >
              {{ box.index }}
            </el-button>
          </div>
          <div class="container-grid">
            <el-button
              v-for="evaluation in sortedEvaluations"
              :key="evaluation.container.id"
              :class="{
                active: selectedContainerId === evaluation.container.id,
                best: result?.bestContainerId === evaluation.container.id,
                'balance-blocked': evaluation.fitStatus === 'balance-blocked',
                unavailable: evaluation.fitStatus === 'oversize'
              }"
              class="container-card"
              text
              :title="evaluationHint(evaluation)"
              @click="selectContainer(evaluation.container.id)"
            >
              <span class="container-icon">{{ containerIcon(evaluation.container.name) }}</span>
              <strong>{{ evaluation.container.name }}</strong>
              <small>{{ evaluation.container.lengthCm }} × {{ evaluation.container.widthCm }} × {{ evaluation.container.heightCm }} cm</small>
              <b :class="['fit-status', evaluation.fitStatus || 'fit']">{{ evaluationFitText(evaluation) }}</b>
              <em>占用率 {{ fmt(evaluation.firstBoxFillPercent, 1) }}% · {{ evaluationCostText(evaluation) }}</em>
              <small class="recommendation-meta">{{ evaluationRecommendationText(evaluation) }}</small>
            </el-button>
          </div>
        </section>

        <section class="panel visual-panel">
          <div class="section-head">
            <div>
              <p>Interactive 3D Packing</p>
              <h2>{{ selectedContainer?.name || "请选择箱型" }} · 第 {{ selectedBoxIndex }} 货舱</h2>
            </div>
          </div>
          <ContainerScene
            :container="selectedContainer"
            :placements="selectedPlacements"
            :evaluation="selectedEvaluation"
            :selected-box="selectedBox"
            :balance-validation="selectedBox?.balanceValidation"
            v-model:show-remaining="showRemaining"
            v-model:show-mass-balance="showMassBalance"
            :busy="loading || switchingBox"
            :exporting="exportingReport"
            :export-zip-label="exportZipLabel"
            :can-export="selectedPlanExportable"
            :can-export-zip="selectedPlanExportable && Boolean(selectedEvaluation?.packedBoxes?.length)"
            @export-image="exportCurrentReport('png')"
            @export-pdf="exportCurrentReport('pdf')"
            @export-zip="exportAllReportsZip"
            @print="printCurrentPlan"
          />
        </section>
      </section>
      </Transition>
    </main>

    <AlgorithmPage
      v-else-if="activePage === 'algorithm'"
      key="algorithm"
      :evaluation="selectedEvaluation"
    />
    </Transition>
      </section>
    </div>

    <CargoModal v-if="cargoModalOpen" :cargo="editingCargo" @close="closeCargoModal" @save="saveCargo" />
    <ContainerModal v-if="containerModalOpen" @close="containerModalOpen = false" @save="saveContainer" />
    <div v-if="profileOpen" class="modal-backdrop profile-backdrop">
      <div class="modal profile-modal">
        <header class="profile-modal-head">
          <div class="profile-identity">
            <span class="profile-avatar">{{ profileInitial }}</span>
          <div>
            <p>Personal Center</p>
            <h2>{{ userDisplayName }}</h2>
            <small>{{ currentUser?.username }}</small>
          </div>
        </div>
          <el-button class="icon-button" text @click="profileOpen = false">×</el-button>
        </header>
        <div class="profile-hero">
          <div>
            <span class="profile-role-pill">{{ profileRoleText }}</span>
            <h3>欢迎回来，{{ userDisplayName }}</h3>
            <p>这里汇总当前工作区、登录会话和常用入口，后续个人偏好会同步到员工自己的工作区。</p>
          </div>
          <div class="profile-session-card">
            <span>令牌有效期</span>
            <strong>{{ sessionExpiryText }}</strong>
            <small>6 小时自动下线</small>
          </div>
        </div>
        <div class="profile-summary-grid refined">
          <div><span>货物种类</span><strong>{{ cargoTypeCount }}</strong><small>当前计划</small></div>
          <div><span>货物总件数</span><strong>{{ cargoTotalQuantity }}</strong><small>件</small></div>
          <div><span>箱型数量</span><strong>{{ containers.length }}</strong><small>可参与计算</small></div>
          <div><span>计划参数</span><strong>{{ utilizationPercent }}% / {{ globalGapCm }}cm</strong><small>可用率 / 间隙</small></div>
        </div>
        <div class="profile-action-grid">
          <RouterLink to="/planner/config" @click="profileOpen = false">
            <b>装箱计算</b><span>配置参数和箱型</span>
          </RouterLink>
          <RouterLink to="/planner/cargos" @click="profileOpen = false">
            <b>智能导入</b><span>Excel 与文本识别</span>
          </RouterLink>
          <RouterLink to="/algorithm" @click="profileOpen = false">
            <b>算法说明</b><span>查看规则与策略</span>
          </RouterLink>
          <RouterLink v-if="currentUser?.role === 'ADMIN'" to="/admin" @click="profileOpen = false">
            <b>管理后台</b><span>员工、设备和系统</span>
          </RouterLink>
        </div>
        <div class="profile-footer">
          <span>{{ profileRoleText }} / {{ currentUser?.username }}</span>
          <el-button type="danger" plain @click="handleLogout">退出登录</el-button>
        </div>
      </div>
    </div>
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
  <Transition name="login-redirect">
    <div v-if="loginRedirecting" class="login-redirect-overlay">
      <div class="login-redirect-card">
        <span class="login-redirect-mark">CP</span>
        <strong>{{ loginRedirectText }}</strong>
        <small>正在加载工作区与权限面板</small>
        <i></i>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { UploadFile } from "element-plus";
import {
  ArrowLeft,
  Box,
  DataAnalysis,
  Delete,
  Document,
  Download,
  Expand,
  Files,
  Fold,
  House,
  MagicStick,
  Operation,
  Plus,
  Refresh,
  Setting,
  Star,
  Tickets,
  Upload
} from "@element-plus/icons-vue";
import AdminDashboard from "./components/AdminDashboard.vue";
import AlgorithmPage from "./components/AlgorithmPage.vue";
import ExcelTemplatePage from "./components/ExcelTemplatePage.vue";
import HomePage from "./components/HomePage.vue";
import LoginPage from "./components/LoginPage.vue";
import CargoModal from "./components/CargoModal.vue";
import ContainerModal from "./components/ContainerModal.vue";
import ContainerScene from "./components/ContainerScene.vue";
import { exportPackingReportsZip, exportPackingReport } from "./services/exportReport";
import { assignCargoModels } from "./services/excelImport";
import { calculatePacking, estimatePackingWorkload } from "./services/packingClient";
import { cloneDefaultContainers, mergeDefaultContainers } from "./services/localData";
import { fetchAdminMe, logoutAdmin } from "./services/adminApi";
import { clearSession, isSessionExpired, storedExpiresAt, storedToken, storedUser } from "./services/authSession";
import { cargoLabel, fmt, shortType, uid } from "./utils/format";

const STORAGE_KEY = "cargo-planner-vue-state";
const TEMPLATE_STORAGE_KEY = "cargo-planner-cargo-templates";
const colors = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];

const route = useRoute();
const router = useRouter();
const profileVersion = ref(0);
const sidebarCollapsed = ref(false);
const authChecked = ref(false);
const workspaceReady = ref(false);
const hasStoredWorkspace = ref(false);
const currentUser = ref(storedUser());
const profileOpen = ref(false);
const loginRedirecting = ref(false);
const loginRedirectText = ref("正在进入系统...");
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
const activePlannerStep = computed(() => plannerMode.value === "results" ? "results" : "config");
const activeStepIndex = computed(() => activePlannerStep.value === "results" ? 1 : 0);
const activePlannerStepLabel = computed(() =>
  activePlannerStep.value === "results" ? "计算方案" : "配置与货物管理"
);
const activeMenuIndex = computed(() => {
  if (activePage.value === "planner") return activePlannerStep.value === "results" ? "/planner/results" : "/planner/config";
  if (activePage.value === "algorithm") return "/algorithm";
  return "/home";
});
const pageTitle = computed(() => ({
  home: "工作台首页",
  planner: "装箱计算",
  algorithm: "算法说明",
  admin: "管理后台"
}[activePage.value] || "工作台"));
const userDisplayName = computed(() => {
  profileVersion.value;
  return currentUser.value?.displayName || currentUser.value?.username || "操作员";
});
const profileInitial = computed(() => userDisplayName.value.slice(0, 1).toUpperCase());
const profileRoleText = computed(() => currentUser.value?.role === "ADMIN" ? "管理员" : "员工");
const sessionExpiryText = computed(() => {
  const value = storedExpiresAt();
  if (!value) return "6 小时";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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
const smartImportOpen = ref(false);
const selectedCargoRows = ref<any[]>([]);
const editingCargo = ref(null);
const cargoTemplates = ref([]);
const templateName = ref("");
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
const detailedBoxCount = computed(() => selectedEvaluation.value?.packedBoxes?.length || 0);
const hasUndetailedBoxes = computed(() =>
  Boolean(selectedEvaluation.value?.estimatedBoxes && Number(selectedEvaluation.value?.boxes || 0) > detailedBoxCount.value)
);
const boxSwitchLabel = computed(() => {
  const total = Number(selectedEvaluation.value?.boxes || 0);
  if (hasUndetailedBoxes.value) return `显示已详算货舱 ${detailedBoxCount.value} / 约 ${total}`;
  return `显示货舱 ${detailedBoxCount.value || total}`;
});
const exportZipLabel = computed(() => hasUndetailedBoxes.value ? "导出已详算 ZIP" : "导出整套 ZIP");
const selectedPlanExportable = computed(() =>
  Boolean(selectedPlacements.value.length && isEvaluationExportable(selectedEvaluation.value))
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
const packingWorkloadHint = computed(() => estimatePackingWorkload({
  cargos: cargos.value,
  containers: containers.value,
  utilizationPercent: utilizationPercent.value,
  globalGapCm: globalGapCm.value
}));
const showPackingWorkloadHint = computed(() =>
  packingWorkloadHint.value.rawUnitCount >= 120
  || packingWorkloadHint.value.typeCount >= 40
  || packingWorkloadHint.value.seconds >= 20
);
const plannerWorkflowSteps = computed(() => [
  {
    key: "config",
    no: "01",
    label: "配置与货物管理",
    description: `${utilizationPercent.value}% 可用率 / ${globalGapCm.value}cm 间隙 · ${cargoTypeCount.value} 类货物`,
    done: cargos.value.length > 0,
    disabled: false
  },
  {
    key: "results",
    no: "02",
    label: "计算方案",
    description: selectedEvaluation.value ? `${selectedEvaluation.value.container.name} / ${evaluationFitText(selectedEvaluation.value)}` : "可视化与导出",
    done: Boolean(selectedEvaluation.value?.packedBoxes?.length),
    disabled: !cargos.value.length
  }
]);

onMounted(async () => {
  window.addEventListener("auth-expired", handleAuthExpired);
  await initializeAuth();
  restoreState();
  restoreCargoTemplates();
  cargos.value = normalizeCargoModels(cargos.value);
  if (!containers.value.length) containers.value = cloneDefaultContainers();
  if (!selectedContainerId.value && containers.value[0]) selectedContainerId.value = containers.value[0].id;
  if (!cargos.value.length && !hasStoredWorkspace.value) loadSample(false);
  workspaceReady.value = true;
  recalculate();
});

onUnmounted(() => {
  window.removeEventListener("auth-expired", handleAuthExpired);
});

watch([cargos, containers, utilizationPercent, globalGapCm], () => {
  persistState();
  window.clearTimeout(timer);
  timer = window.setTimeout(recalculate, 400);
}, { deep: true });

watch([showRemaining, showMassBalance], persistState);
watch([workspaceReady, activePage, plannerMode, cargoTypeCount], () => {
  if (workspaceReady.value && activePage.value === "planner" && plannerMode.value === "results" && !cargos.value.length) {
    router.replace("/planner/config");
    showToast("请先确认配置并录入货物，再进入计算方案。");
  }
});
watch([activePage, currentUser, authChecked], () => {
  if (authChecked.value && activePage.value === "admin" && currentUser.value?.role !== "ADMIN") {
    router.replace("/home");
  }
});

async function initializeAuth() {
  const cachedUser = storedUser();
  if (!storedToken() || isSessionExpired()) {
    clearSession();
    currentUser.value = null;
    authChecked.value = true;
    return;
  }
  try {
    currentUser.value = await fetchAdminMe();
  } catch (error) {
    if (cachedUser && storedToken() && error?.retryable !== false) {
      currentUser.value = cachedUser;
      showToast("已恢复本地登录状态，后台连接恢复后会自动继续校验。");
    } else {
      clearSession();
      currentUser.value = null;
    }
  } finally {
    authChecked.value = true;
  }
}

async function handleLoggedIn(user) {
  currentUser.value = user;
  profileVersion.value += 1;
  const target = user?.role === "ADMIN" ? "/admin" : "/home";
  loginRedirectText.value = user?.role === "ADMIN" ? "正在进入后台管理" : "正在进入个人工作台";
  loginRedirecting.value = true;
  await new Promise((resolve) => window.setTimeout(resolve, 520));
  await router.replace(target);
  window.setTimeout(() => {
    loginRedirecting.value = false;
  }, 260);
}

async function handleLogout() {
  try {
    await logoutAdmin();
  } catch {
    clearSession();
  }
  currentUser.value = null;
  profileOpen.value = false;
  router.push("/home");
}

function handleAuthExpired() {
  clearSession();
  currentUser.value = null;
  profileOpen.value = false;
  showToast("登录已过期，请重新登录。");
}

function handleUserUpdated(user) {
  if (user) currentUser.value = user;
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    hasStoredWorkspace.value = Boolean(raw);
    const saved = JSON.parse(raw || "{}");
    cargos.value = saved.cargos || [];
    containers.value = mergeDefaultContainers(saved.containers || []);
    utilizationPercent.value = saved.utilizationPercent || 90;
    globalGapCm.value = saved.globalGapCm ?? 1;
    showRemaining.value = saved.showRemaining ?? true;
    showMassBalance.value = saved.showMassBalance ?? true;
    selectedContainerId.value = saved.selectedContainerId || "";
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    hasStoredWorkspace.value = false;
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

function restoreCargoTemplates() {
  try {
    const stored = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || "[]");
    cargoTemplates.value = Array.isArray(stored)
      ? stored.filter((template) => template?.id && template?.name && Array.isArray(template.cargos)).slice(0, 20)
      : [];
  } catch {
    localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    cargoTemplates.value = [];
  }
}

function persistCargoTemplates() {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(cargoTemplates.value.slice(0, 20)));
}

function goPlannerStep(stepKey) {
  if (stepKey === "results" && !cargos.value.length) {
    showToast("请先录入货物，再计算装箱方案。");
    router.push("/planner/cargos");
    return;
  }
  const routeMap = {
    config: "/planner/config",
    cargos: "/planner/cargos",
    results: "/planner/results"
  };
  router.push(routeMap[stepKey] || "/planner/config");
}

function handleMenuSelect(index) {
  if (index === "/planner/results") {
    goPlannerStep("results");
    return;
  }
  router.push(index);
}

async function recalculate() {
  if (!cargos.value.length || !containers.value.length) return;
  const seq = ++calcSeq;
  const workload = estimatePackingWorkload({
    cargos: cargos.value,
    containers: containers.value,
    utilizationPercent: utilizationPercent.value,
    globalGapCm: globalGapCm.value
  });
  loading.value = true;
  apiStatus.value = workload.seconds >= 20 ? `预计 ${workload.durationLabel}` : "正在计算";
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
  const evaluations = [...(nextResult?.evaluations || [])].sort(compareEvaluationForUi);
  return {
    ...nextResult,
    bestContainerId: evaluations[0]?.container?.id || nextResult?.bestContainerId || null,
    evaluations
  };
}

function compareEvaluationForUi(a, b) {
  const scoreA = Number(a?.recommendation?.score);
  const scoreB = Number(b?.recommendation?.score);
  if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) return scoreA - scoreB;
  const statusDiff = evaluationStatusRank(a) - evaluationStatusRank(b);
  if (statusDiff) return statusDiff;
  const costDiff = Number(a?.recommendation?.estimatedCost || 9999) - Number(b?.recommendation?.estimatedCost || 9999);
  if (costDiff) return costDiff;
  const boxDiff = normalizedEvaluationBoxes(a) - normalizedEvaluationBoxes(b);
  if (boxDiff) return boxDiff;
  return Math.abs(Number(a?.firstBoxFillPercent || 0) - 82) - Math.abs(Number(b?.firstBoxFillPercent || 0) - 82);
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

function handleCargoSelectionChange(rows: any[]) {
  selectedCargoRows.value = rows;
}

function deleteSelectedCargos() {
  if (!selectedCargoRows.value.length) return;
  if (!window.confirm(`确认删除选中的 ${selectedCargoRows.value.length} 类货物吗？`)) return;
  const ids = new Set(selectedCargoRows.value.map((item) => item.id));
  cargos.value = cargos.value.filter((item) => !ids.has(item.id));
  selectedCargoRows.value = [];
  if (!cargos.value.length) result.value = null;
  selectedBoxIndex.value = 1;
  showToast("已批量删除货物。");
}

function touchCargoList() {
  result.value = null;
  selectedBoxIndex.value = 1;
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
  result.value = null;
  selectedBoxIndex.value = 1;
  if (notify) showToast("已套用示例货物。");
}

function clearCargos() {
  if (!cargos.value.length) {
    showToast("当前没有货物可清空。");
    return;
  }
  if (!window.confirm("确认清空当前全部货物吗？这个操作不会删除已保存的模板。")) return;
  cargos.value = [];
  result.value = null;
  selectedBoxIndex.value = 1;
  showToast("已清空货物。");
}

function saveCargoTemplate() {
  if (!cargos.value.length) {
    showToast("请先录入货物，再保存模板。");
    return;
  }
  const name = templateName.value || `货物模板 ${cargoTemplates.value.length + 1}`;
  const snapshot = cargos.value.map(({ id, ...cargo }) => ({ ...cargo }));
  const template = {
    id: uid("tpl"),
    name,
    cargos: snapshot,
    createdAt: new Date().toISOString()
  };
  cargoTemplates.value = [template, ...cargoTemplates.value.filter((item) => item.name !== name)].slice(0, 20);
  templateName.value = "";
  persistCargoTemplates();
  showToast("已保存货物模板。");
}

function applyCargoTemplate(templateId) {
  const template = cargoTemplates.value.find((item) => item.id === templateId);
  if (!template) return;
  cargos.value = normalizeCargoModels(template.cargos.map((cargo, index) => ({
    ...cargo,
    id: uid("cargo"),
    color: cargo.color || systemColorFor(index)
  })));
  result.value = null;
  selectedBoxIndex.value = 1;
  router.push("/planner/cargos");
  showToast(`已套用模板「${template.name}」。`);
}

function deleteSelectedCargoTemplate() {
  const template = cargoTemplates.value[0];
  if (!template) return;
  if (!window.confirm(`确认删除最近模板「${template.name}」吗？`)) return;
  cargoTemplates.value = cargoTemplates.value.slice(1);
  persistCargoTemplates();
  showToast("已删除模板。");
}

function templateQuantity(template) {
  return (template.cargos || []).reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0);
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
  if (!isEvaluationExportable(selectedEvaluation.value)) {
    showToast("当前方案被偏载校验拦截，仅可预览调载参考，不能导出正式图纸。");
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

async function exportAllReportsZip() {
  if (!selectedContainer.value || !selectedEvaluation.value?.packedBoxes?.length) {
    showToast("当前没有可打包导出的装箱方案。");
    return;
  }
  if (!isEvaluationExportable(selectedEvaluation.value)) {
    showToast("当前方案被偏载校验拦截，仅可预览调载参考，不能导出正式图纸。");
    return;
  }
  exportingReport.value = true;
  showToast(hasUndetailedBoxes.value ? "正在打包已详算货舱报告..." : "正在打包整套装箱报告...");
  try {
    await exportPackingReportsZip({
      container: selectedContainer.value,
      evaluation: normalizeEvaluationForExport(selectedEvaluation.value),
      cargos: cargos.value,
      utilizationPercent: utilizationPercent.value,
      globalGapCm: globalGapCm.value,
      showMassBalance: showMassBalance.value
    });
    showToast(hasUndetailedBoxes.value ? "已详算货舱报告 ZIP 已导出。" : "整套装箱报告 ZIP 已导出。");
  } catch (error) {
    showToast(error.message || "批量导出失败，请稍后重试。");
  } finally {
    exportingReport.value = false;
  }
}

function printCurrentPlan() {
  if (!selectedContainer.value || !selectedPlacements.value.length) {
    showToast("当前没有可打印的装箱方案。");
    return;
  }
  if (!isEvaluationExportable(selectedEvaluation.value)) {
    showToast("当前方案被偏载校验拦截，仅可预览调载参考，不能打印正式图纸。");
    return;
  }
  window.print();
}

function normalizeEvaluationForExport(evaluation) {
  if (!evaluation) return evaluation;
  return {
    ...evaluation,
    packedBoxes: (evaluation.packedBoxes || []).map((box) => ({
      ...box,
      placed: (box.placed || []).map((item) => ({ ...item, type: shortType(item.type) }))
    }))
  };
}

function handleCsvUpload(uploadFile: UploadFile) {
  const file = uploadFile.raw;
  if (file) importCsvFile(file);
}

function importCsv(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importCsvFile(file);
  input.value = "";
}

function importCsvFile(file: Blob) {
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
    result.value = null;
    selectedBoxIndex.value = 1;
    showToast("CSV 已导入。");
  };
  reader.readAsText(file, "utf-8");
}

function containerIcon(name) {
  if (name.includes("FR") || name.includes("平板")) return "FR";
  if (name.includes("RF") || name.includes("冷藏")) return "RF";
  if (name.includes("45")) return "45";
  if (name.includes("40")) return "40";
  return "20";
}

function evaluationFitText(evaluation) {
  const boxes = Number(evaluation?.boxes || 0);
  if (boxes <= 0 || evaluation?.fitStatus === "oversize") return "不可装";
  const boxText = `${evaluation?.estimatedBoxes ? "约 " : ""}${boxes} 箱`;
  if (evaluation?.fitStatus === "balance-blocked") return `${boxText} · 偏载拦截`;
  return boxText;
}

function evaluationCostText(evaluation) {
  const recommendation = evaluation?.recommendation || {};
  const cost = Number(recommendation.costFactor || 0);
  const costText = cost > 0 ? `×${cost.toFixed(2)}` : "";
  return `${priceTierText(recommendation.priceTier)}${costText ? ` ${costText}` : ""}`;
}

function evaluationRecommendationText(evaluation) {
  const recommendation = evaluation?.recommendation || {};
  const status = evaluation?.fitStatus === "balance-blocked"
    ? "几何可装，需调载"
    : evaluation?.fitStatus === "oversize"
      ? "尺寸/承载不可行"
      : "合规候选";
  return `${status} · ${equipmentClassText(recommendation.equipmentClass)} · ${utilizationBandText(recommendation.utilizationBand)}`;
}

function evaluationHint(evaluation) {
  const recommendation = evaluation?.recommendation || {};
  const score = Number(recommendation.score || 0);
  const scoreText = score > 0 ? `；综合评分 ${score.toFixed(0)}，分数越低越优` : "";
  return `状态：${evaluationRecommendationText(evaluation)}；参考费用：${evaluationCostText(evaluation)}；占用率 ${fmt(evaluation?.firstBoxFillPercent || 0, 1)}%${scoreText}`;
}

function priceTierText(tier) {
  return {
    economy: "经济档",
    standard: "标准档",
    high: "较高档",
    special: "特种高价"
  }[tier] || tier || "参考价";
}

function equipmentClassText(value) {
  return {
    GP: "普柜",
    HQ: "高柜",
    "45HQ": "45高柜",
    RF: "冷藏柜",
    FR: "平板柜"
  }[value] || "箱型";
}

function utilizationBandText(value) {
  return {
    none: "无装载",
    low: "低利用",
    moderate: "适中利用",
    balanced: "均衡利用",
    tight: "偏紧利用"
  }[value] || "利用率待评估";
}

function evaluationStatusRank(evaluation) {
  if (evaluation?.fitStatus === "fit") return 0;
  if (evaluation?.fitStatus === "balance-blocked") return 1;
  return 2;
}

function normalizedEvaluationBoxes(evaluation) {
  const boxes = Number(evaluation?.boxes || 0);
  return boxes > 0 ? boxes : 9999;
}

function isEvaluationExportable(evaluation) {
  return Boolean(evaluation && evaluation.fitStatus !== "balance-blocked" && evaluation.fitStatus !== "oversize");
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
