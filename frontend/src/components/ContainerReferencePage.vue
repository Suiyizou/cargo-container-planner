<template>
  <section class="container-reference-page">
    <el-card class="planner-page-head" shadow="never">
      <div class="page-heading">
        <p>{{ tr("Container Reference") }}</p>
        <h2>{{ ui('container.referenceTitle') }}</h2>
      </div>
      <RouterLink to="/planner/config">
        <el-button type="primary" plain>{{ ui('container.backToConfig') }}</el-button>
      </RouterLink>
    </el-card>

    <el-alert
      class="container-source-alert"
      :title="ui('container.sourceAlert')"
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
              <h3>{{ tr(container.name) }}</h3>
            </div>
            <el-tag v-if="container.ignoreHeightLimit" type="warning" effect="plain">{{ ui('container.flatRackHeightIgnored') }}</el-tag>
          </div>

          <dl class="container-reference-specs">
            <div><dt>{{ ui('container.calcSize') }}</dt><dd>{{ dimensionText(container) }} cm</dd></div>
            <div><dt>{{ ui('container.maxPayload') }}</dt><dd>{{ payloadText(container) }}</dd></div>
            <div><dt>{{ ui('container.dimensionBasis') }}</dt><dd>{{ sourceText(container.dimensionBasis, ui('container.manualDimensions')) }}</dd></div>
          </dl>

          <p class="container-reference-note">{{ sourceText(container.dimensionNote, ui('container.customNote')) }}</p>
          <el-link
            v-if="container.dimensionSourceUrl"
            type="primary"
            :href="container.dimensionSourceUrl"
            target="_blank"
            :underline="false"
          >
            {{ tr(container.dimensionSource) }}
          </el-link>
          <span v-else class="container-reference-custom-source">{{ sourceText(container.dimensionSource, ui('container.userDefinedDimensions')) }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { currentLocale } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

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
    common: ui('container.priority.common'),
    limited: ui('container.priority.limited'),
    special: ui('container.priority.special')
  }[value] || ui('container.priority.custom');
}

function sourceText(value: unknown, fallback: string) {
  return tr(value || fallback);
}

function tr(value: unknown) {
  return translateLegacyText(value == null ? "" : String(value), currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

function priorityTagType(value: string) {
  return {
    common: "success",
    limited: "warning",
    special: "info"
  }[value] || "primary";
}
</script>
