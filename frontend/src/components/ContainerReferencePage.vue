<template>
  <section class="container-reference-page">
    <el-card class="planner-page-head" shadow="never">
      <div class="page-heading">
        <p>Container Reference</p>
        <h2>箱型尺寸资料库</h2>
      </div>
      <RouterLink to="/planner/config">
        <el-button type="primary" plain>返回配置页</el-button>
      </RouterLink>
    </el-card>

    <el-alert
      class="container-source-alert"
      title="尺寸资料来自公开船司/箱东页面，只作为方案估算基准；实际装柜请以放箱柜号、场站实测、订舱设备和绑扎方案为准。普通货优先选择普柜/高柜，冷藏和平板作为特殊设备候选。"
      type="info"
      show-icon
      :closable="false"
    />

    <div class="container-reference-grid">
      <article
        v-for="container in referenceRows"
        :key="container.id"
        class="container-reference-card"
        :class="container.visualKind || 'dry'"
      >
        <div class="container-model-stage">
          <div class="container-model" :class="container.visualKind || 'dry'">
            <span class="model-face front">{{ containerIcon(container.name) }}</span>
            <span class="model-face side"></span>
            <span class="model-face top"></span>
          </div>
        </div>
        <div class="container-reference-body">
          <div class="container-reference-head">
            <div>
              <el-tag :type="priorityTagType(container.usagePriority)" effect="light">
                {{ priorityText(container.usagePriority) }}
              </el-tag>
              <h3>{{ container.name }}</h3>
            </div>
            <el-tag v-if="container.ignoreHeightLimit" type="warning" effect="plain">平板不计高度</el-tag>
          </div>

          <dl class="container-reference-specs">
            <div><dt>计算尺寸</dt><dd>{{ dimensionText(container) }} cm</dd></div>
            <div><dt>最大载重</dt><dd>{{ payloadText(container) }}</dd></div>
            <div><dt>尺寸依据</dt><dd>{{ container.dimensionBasis || "手动录入尺寸" }}</dd></div>
          </dl>

          <p class="container-reference-note">{{ container.dimensionNote || "自定义箱型，请按实际设备复核。" }}</p>
          <el-link
            v-if="container.dimensionSourceUrl"
            type="primary"
            :href="container.dimensionSourceUrl"
            target="_blank"
            :underline="false"
          >
            {{ container.dimensionSource }}
          </el-link>
          <span v-else class="container-reference-custom-source">{{ container.dimensionSource || "用户自定义尺寸" }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
  containers: { type: Array, default: () => [] }
});

const referenceRows = computed(() => (props.containers as any[]).map((container) => ({
  ...container,
  visualKind: container.visualKind || inferVisualKind(container),
  usagePriority: container.usagePriority || inferPriority(container)
})));

function inferVisualKind(container: any) {
  const text = `${container?.id || ""} ${container?.name || ""}`.toLowerCase();
  if (/fr|flat|平板/.test(text)) return "flat-rack";
  if (/rf|reefer|冷藏/.test(text)) return "reefer";
  if (/hq|high|高/.test(text)) return "high-cube";
  return "dry";
}

function inferPriority(container: any) {
  const kind = inferVisualKind(container);
  if (kind === "dry" || kind === "high-cube") return "common";
  return "special";
}

function containerIcon(name: string) {
  if (name.includes("FR") || name.includes("平板")) return "FR";
  if (name.includes("RF") || name.includes("冷藏")) return "RF";
  if (name.includes("45")) return "45";
  if (name.includes("40")) return "40";
  return "20";
}

function dimensionText(container: any) {
  return `${formatNumber(container.lengthCm)} × ${formatNumber(container.widthCm)} × ${formatNumber(container.heightCm)}`;
}

function payloadText(container: any) {
  const value = Number(container?.payloadKg || 0);
  if (!value) return "-";
  return value >= 1000 ? `${formatNumber(value / 1000)} t` : `${formatNumber(value)} kg`;
}

function formatNumber(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, "");
}

function priorityText(value: string) {
  return {
    common: "常用",
    limited: "少量使用",
    special: "特殊设备"
  }[value] || "自定义";
}

function priorityTagType(value: string) {
  return {
    common: "success",
    limited: "warning",
    special: "info"
  }[value] || "primary";
}
</script>
