<template>
  <section ref="shellRef" class="packing-visual-shell" :class="{ fullscreen: isFullscreen }">
    <el-card class="packing-visual-toolbar" shadow="never">
      <div class="toolbar-left">
        <el-button :icon="Refresh" @click="setView('iso')">视角复位</el-button>
        <el-segmented v-model="viewMode" :options="viewModeOptions" size="default" />
        <el-button-group>
          <el-button :type="activeView === 'front' ? 'primary' : 'default'" @click="setView('front')">正视</el-button>
          <el-button :type="activeView === 'side' ? 'primary' : 'default'" @click="setView('side')">侧视</el-button>
          <el-button :type="activeView === 'top' ? 'primary' : 'default'" @click="setView('top')">俯视</el-button>
          <el-button :type="activeView === 'iso' ? 'primary' : 'default'" @click="setView('iso')">轴测</el-button>
        </el-button-group>
      </div>
      <div class="toolbar-right">
        <el-switch v-model="sliceEnabled" active-text="剖切" inactive-text="剖切" />
        <el-popover placement="bottom-end" trigger="click" width="260">
          <template #reference>
            <el-button :icon="Setting">显示选项</el-button>
          </template>
          <div class="visual-option-grid">
            <el-checkbox v-model="showLabels">货号标签</el-checkbox>
            <el-checkbox v-model="remainingModel">剩余空间</el-checkbox>
            <el-checkbox v-model="massModel">重心偏载</el-checkbox>
            <el-checkbox v-model="showGrid">底部网格</el-checkbox>
            <el-checkbox v-model="showShell">箱体外壳</el-checkbox>
            <el-checkbox v-model="showCenter">几何中心</el-checkbox>
            <el-checkbox v-model="translucentCargo">半透明货物</el-checkbox>
            <el-checkbox v-model="showHeatmap">重量热力</el-checkbox>
          </div>
        </el-popover>
        <el-button :icon="isFullscreen ? Aim : FullScreen" @click="toggleFullscreen">
          {{ isFullscreen ? "退出全屏" : "全屏" }}
        </el-button>
      </div>
    </el-card>

    <el-card v-if="sliceEnabled" class="slice-control-card" shadow="never">
      <div class="slice-control-row">
        <span>剖切方向</span>
        <el-radio-group v-model="sliceAxis" size="small">
          <el-radio-button value="z">Z 高度</el-radio-button>
          <el-radio-button value="x">X 前后</el-radio-button>
          <el-radio-button value="y">Y 左右</el-radio-button>
        </el-radio-group>
        <el-slider v-model="slicePercent" :min="0" :max="100" :step="1" />
        <el-tag effect="plain">{{ sliceLabel }}</el-tag>
      </div>
    </el-card>

    <div class="packing-visual-layout">
      <div class="packing-canvas-panel" @pointermove="handlePointerMove" @pointerleave="handlePointerLeave">
        <div ref="canvasHost" class="packing-scene-canvas"></div>
        <div v-if="busy" class="loading-mask visual-loading">
          <div class="spinner"></div>
          <span>正在生成 3D 装箱视图...</span>
        </div>
        <div v-else-if="emptyStateVisible" class="visual-empty-state">
          <el-empty :description="emptyStateText" />
        </div>
        <div v-if="tooltip.visible" class="scene-tooltip visual-tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
          <strong>#{{ tooltip.item.displayNo }} {{ tooltip.item.name }}</strong>
          <span>尺寸 {{ tooltip.item.lengthCm }} × {{ tooltip.item.widthCm }} × {{ tooltip.item.heightCm }} cm</span>
          <span>数量 {{ tooltip.item.quantity }} 件 · 重量 {{ formatWeight(tooltip.item.weightKg) }}</span>
          <span>{{ tooltip.item.orientationLabel || tooltip.item.bottomFaceDetail || "按算法输出坐标摆放" }}</span>
          <span>坐标 X{{ tooltip.item.xCm }} / Y{{ tooltip.item.yCm }} / Z{{ tooltip.item.zCm }} cm</span>
        </div>
      </div>

      <aside class="packing-info-panel">
        <el-card class="info-panel-card" shadow="never">
          <template #header>
            <div class="info-card-head">
              <strong>{{ sceneData.container?.name || "未选择箱型" }}</strong>
              <el-tag size="small" effect="plain">{{ viewMode === "3d" ? "3D装箱" : "2D视角" }}</el-tag>
            </div>
          </template>
          <div class="stats-grid compact">
            <div>
              <span>总件数</span>
              <b>{{ sceneData.stats.totalPieces }}</b>
            </div>
            <div>
              <span>总体积</span>
              <b>{{ sceneData.stats.totalVolumeM3.toFixed(2) }} m³</b>
            </div>
            <div>
              <span>空间利用率</span>
              <b>{{ sceneData.stats.utilizationPercent.toFixed(1) }}%</b>
            </div>
            <div>
              <span>总毛重</span>
              <b>{{ formatWeight(sceneData.stats.totalWeightKg) }}</b>
            </div>
          </div>
          <el-alert
            v-if="sceneData.stats.performanceMode"
            class="visual-performance-alert"
            type="warning"
            title="已启用流畅模式"
            description="货物超过100件，系统自动关闭标签与热力特效。"
            show-icon
            :closable="false"
          />
        </el-card>

        <el-card class="info-panel-card" shadow="never">
          <template #header>
            <div class="info-card-head">
              <strong>偏载重心</strong>
              <el-tag :type="balanceState.tagType" effect="light">{{ balanceState.label }}</el-tag>
            </div>
          </template>
          <div class="balance-summary">
            <p>{{ balanceState.description }}</p>
            <div class="balance-metric-list">
              <span>重心坐标</span>
              <b>X {{ balanceState.center.xCm.toFixed(1) }} / Y {{ balanceState.center.yCm.toFixed(1) }} / Z {{ balanceState.center.zCm.toFixed(1) }} cm</b>
              <span>横向偏移 Y</span>
              <b>{{ formatSigned(balanceState.offset.lateralCm ?? balanceState.offset.yCm) }} cm / {{ formatSigned(balanceState.offset.lateralPercent ?? balanceState.offset.yPercent) }}%</b>
              <span>纵向偏移 X</span>
              <b>{{ formatSigned(balanceState.offset.longitudinalCm ?? balanceState.offset.xCm) }} cm / {{ formatSigned(balanceState.offset.longitudinalPercent ?? balanceState.offset.xPercent) }}%</b>
              <span>重心高度</span>
              <b>{{ balanceState.center.zCm.toFixed(1) }} cm</b>
            </div>
          </div>
          <div class="balance-zone-bars" v-if="balanceState.valid">
            <div>
              <span>前 / 后</span>
              <el-progress :percentage="frontPercent" :stroke-width="10" :show-text="false" />
              <small>前 {{ frontPercent.toFixed(1) }}% · 后 {{ rearPercent.toFixed(1) }}%</small>
            </div>
            <div>
              <span>左 / 右</span>
              <el-progress :percentage="leftPercent" :stroke-width="10" :show-text="false" />
              <small>左 {{ leftPercent.toFixed(1) }}% · 右 {{ rightPercent.toFixed(1) }}%</small>
            </div>
          </div>
        </el-card>

        <el-card class="info-panel-card legend-card" shadow="never">
          <template #header>
            <div class="info-card-head">
              <strong>货物图例</strong>
              <el-button v-if="hiddenSkuKeys.size" link type="primary" @click="showAllSku">全部显示</el-button>
            </div>
          </template>
          <el-scrollbar max-height="260">
            <button
              v-for="item in sceneData.legend"
              :key="item.key"
              class="legend-row"
              :class="{ muted: hiddenSkuKeys.has(item.key) }"
              type="button"
              @click="toggleSku(item.key)"
            >
              <i :style="{ background: item.color }"></i>
              <span>
                <b>{{ item.label }}</b>
                <small>{{ item.quantity }} 件 · {{ formatWeight(item.weightKg) }}</small>
              </span>
              <em>{{ hiddenSkuKeys.has(item.key) ? "隐藏" : "显示" }}</em>
            </button>
          </el-scrollbar>
        </el-card>
      </aside>
    </div>

    <el-card class="packing-bottom-actions" shadow="never">
      <div>
        <el-tag :type="balanceState.tagType" effect="light">{{ balanceState.label }}</el-tag>
        <span>左键旋转 · 右键平移 · 滚轮缩放</span>
      </div>
      <div class="bottom-button-group">
        <el-button :icon="Picture" :disabled="exportDisabled" :loading="exporting" @click="$emit('export-image')">导出可视化截图</el-button>
        <el-button :icon="Document" :disabled="exportDisabled" :loading="exporting" @click="$emit('export-pdf')">导出装箱方案 PDF</el-button>
        <el-button type="primary" :icon="Download" :disabled="zipDisabled" :loading="exporting" @click="$emit('export-zip')">{{ exportZipLabel }}</el-button>
        <el-button :icon="Printer" @click="$emit('print')">打印</el-button>
      </div>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  Aim,
  Document,
  Download,
  FullScreen,
  Picture,
  Printer,
  Refresh,
  Setting
} from "@element-plus/icons-vue";
import { buildPackingSceneData, formatSigned, formatWeight } from "../visualization/packingSceneData";
import { resolveBalanceState } from "../visualization/packingSceneBalance";
import { PackingSceneRenderer } from "../visualization/packingSceneRenderer";
import type { SceneCargo, SceneViewMode, SceneViewPreset, SliceAxis } from "../visualization/packingSceneTypes";

const props = defineProps({
  container: { type: Object, default: null },
  placements: { type: Array, default: () => [] },
  evaluation: { type: Object, default: null },
  selectedBox: { type: Object, default: null },
  balanceValidation: { type: Object, default: null },
  showRemaining: { type: Boolean, default: true },
  showMassBalance: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  exporting: { type: Boolean, default: false },
  exportZipLabel: { type: String, default: "导出整套 ZIP" },
  canExport: { type: Boolean, default: true },
  canExportZip: { type: Boolean, default: true },
  errorMessage: { type: String, default: "" }
});

const emit = defineEmits([
  "update:showRemaining",
  "update:showMassBalance",
  "export-image",
  "export-pdf",
  "export-zip",
  "print"
]);

const shellRef = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const controller = ref<PackingSceneRenderer | null>(null);
const activeView = ref<SceneViewPreset>("iso");
const viewMode = ref<SceneViewMode>("3d");
const sliceEnabled = ref(false);
const sliceAxis = ref<SliceAxis>("z");
const slicePercent = ref(100);
const showLabels = ref(false);
const showGrid = ref(true);
const showCenter = ref(true);
const showShell = ref(true);
const translucentCargo = ref(false);
const showHeatmap = ref(false);
const hiddenSkuKeys = ref<Set<string>>(new Set());
const isFullscreen = ref(false);
const tooltip = reactive<{ visible: boolean; x: number; y: number; item: SceneCargo }>({
  visible: false,
  x: 0,
  y: 0,
  item: {} as SceneCargo
});

const viewModeOptions = [
  { label: "3D", value: "3d" },
  { label: "2D", value: "2d" }
];

const sceneData = computed(() => buildPackingSceneData({
  container: props.container as any,
  placements: props.placements as any[],
  evaluation: props.evaluation
}));
const balanceState = computed(() => resolveBalanceState({
  container: props.container as any,
  placements: props.placements as any[],
  validation: props.balanceValidation || props.selectedBox?.balanceValidation
}));
const remainingModel = computed({
  get: () => props.showRemaining,
  set: (value: boolean) => emit("update:showRemaining", value)
});
const massModel = computed({
  get: () => props.showMassBalance,
  set: (value: boolean) => emit("update:showMassBalance", value)
});
const renderOptions = computed(() => ({
  showLabels: showLabels.value && !sceneData.value.stats.performanceMode,
  showGrid: showGrid.value,
  showCenter: showCenter.value,
  showShell: showShell.value,
  translucentCargo: translucentCargo.value,
  showHeatmap: showHeatmap.value && !sceneData.value.stats.performanceMode,
  showRemaining: props.showRemaining,
  showMassBalance: props.showMassBalance,
  sliceAxis: sliceEnabled.value ? sliceAxis.value : "none",
  slicePercent: slicePercent.value,
  hiddenSkuKeys: hiddenSkuKeys.value,
  viewMode: viewMode.value
}));
const emptyStateVisible = computed(() => !props.busy && (!props.container || !props.placements.length || props.errorMessage));
const emptyStateText = computed(() => props.errorMessage || (!props.container ? "请选择箱型后查看3D装箱视图" : "当前货舱暂无可渲染货物"));
const exportDisabled = computed(() => props.exporting || !props.canExport || !props.placements.length);
const zipDisabled = computed(() => props.exporting || !props.canExportZip);
const frontPercent = computed(() => Number(balanceState.value.loads.frontPercent || 0));
const rearPercent = computed(() => Number(balanceState.value.loads.rearPercent || 0));
const leftPercent = computed(() => Number(balanceState.value.loads.leftPercent || 0));
const rightPercent = computed(() => Number(balanceState.value.loads.rightPercent || 0));
const sliceLabel = computed(() => {
  const container: any = sceneData.value.container;
  if (!container) return `${slicePercent.value}%`;
  if (sliceAxis.value === "z") return `高度 ${Math.round(container.heightCm * slicePercent.value / 100)} cm`;
  if (sliceAxis.value === "x") return `前后 ${Math.round(container.lengthCm * slicePercent.value / 100)} cm`;
  return `左右 ${Math.round(container.widthCm * slicePercent.value / 100)} cm`;
});

onMounted(async () => {
  await nextTick();
  if (!canvasHost.value) return;
  controller.value = new PackingSceneRenderer(canvasHost.value, {
    onHover: (payload) => {
      if (!payload) {
        tooltip.visible = false;
        return;
      }
      tooltip.visible = true;
      tooltip.x = payload.clientX + 14;
      tooltip.y = payload.clientY + 14;
      tooltip.item = payload.item;
    }
  });
  updateScene();
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  controller.value?.dispose();
});

watch([sceneData, balanceState, renderOptions], updateScene, { deep: true });
watch(viewMode, (mode) => {
  if (mode === "2d") setView(activeView.value === "iso" ? "top" : activeView.value);
  else setView("iso");
});
watch(() => sceneData.value.legend.map((item) => item.key).join("|"), () => {
  const allowed = new Set(sceneData.value.legend.map((item) => item.key));
  hiddenSkuKeys.value = new Set([...hiddenSkuKeys.value].filter((key) => allowed.has(key)));
});

function updateScene() {
  controller.value?.update(sceneData.value, balanceState.value, renderOptions.value);
}

function setView(view: SceneViewPreset) {
  activeView.value = view;
  controller.value?.setView(view);
}

function toggleSku(key: string) {
  const next = new Set(hiddenSkuKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  hiddenSkuKeys.value = next;
  tooltip.visible = false;
}

function showAllSku() {
  hiddenSkuKeys.value = new Set();
}

function handlePointerMove(event: PointerEvent) {
  controller.value?.handlePointerMove(event);
}

function handlePointerLeave() {
  controller.value?.handlePointerLeave();
}

async function toggleFullscreen() {
  if (!shellRef.value) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await shellRef.value.requestFullscreen();
  }
  window.setTimeout(() => controller.value?.resize(), 80);
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement === shellRef.value);
  window.setTimeout(() => controller.value?.resize(), 80);
}
</script>
