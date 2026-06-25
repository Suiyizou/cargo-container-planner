<template>
  <section class="algorithm-page">
    <div class="page-title">
      <p>计算说明</p>
      <h2>当前装箱算法与计算留痕</h2>
    </div>

    <div class="algorithm-note trace-card">
      <strong>计算过程在哪执行</strong>
      <p>主页面只负责收集货物和箱型参数，点击计算或修改数量后，浏览器主线程通过 <code>packingClient.js</code> 创建 Web Worker，把数据复制给 <code>packingWorker.js</code>。真正的装箱、旋转、支撑判断、箱型对比都在 Worker 里完成，所以 3D 视图和表单不会被计算过程长时间阻塞。</p>
    </div>

    <div class="algorithm-grid">
      <article>
        <strong>1. 货物展开</strong>
        <p>系统先把每一类货物按数量展开为单件货物，并计算“原始尺寸 + 全局间隙 + 类型额外间隙”后的外廓尺寸。</p>
      </article>
      <article>
        <strong>2. 多策略排序</strong>
        <p>同一箱型会尝试多种顺序：承重优先、体积优先、底面积优先、高度优先。当前重点优化为可堆放货物先形成支撑层，不可重压货物尽量后放到上层。</p>
      </article>
      <article>
        <strong>3. 旋转枚举</strong>
        <p>普通货物会枚举最多 6 种长宽高方向；托盘或保持朝上类型按规则限制旋转。每个结果都会记录 X/Y/Z 分别对应货物原始哪条边。</p>
      </article>
      <article>
        <strong>4. 候选坐标</strong>
        <p>候选点来自箱底、已摆货物右侧、前侧、上方以及边界组合点。每个候选点都要通过边界、不相交、支撑面积三类检查。</p>
      </article>
      <article>
        <strong>5. 支撑约束</strong>
        <p>如果货物不在箱底，下方必须由“可承重货物”的顶面覆盖至少 98.5% 的底面积；不可重压货物不会作为上层支撑。</p>
      </article>
      <article>
        <strong>6. 箱型推荐</strong>
        <p>每个箱型分别试算。推荐顺序优先箱数更少，其次首箱空间占用更高，最后选择箱体体积更小的箱型。</p>
      </article>
    </div>

    <div class="trace-grid">
      <article class="algorithm-note">
        <strong>核心计算公式</strong>
        <ul class="formula-list">
          <li v-for="formula in formulas" :key="formula">{{ formula }}</li>
        </ul>
      </article>

      <article class="algorithm-note">
        <strong>当前计算留痕</strong>
        <div v-if="trace" class="trace-metrics">
          <div><span>选中箱型</span><b>{{ trace.current.containerName }}</b></div>
          <div><span>计算模式</span><b>{{ trace.mode }}</b></div>
          <div><span>货物展开</span><b>{{ trace.parameters.unitCount }} 件</b></div>
          <div><span>计划可用率</span><b>{{ trace.parameters.utilizationPercent }}%</b></div>
          <div><span>货物间隙</span><b>{{ trace.parameters.globalGapCm }} cm</b></div>
          <div><span>支撑阈值</span><b>{{ trace.supportRatioPercent }}%</b></div>
          <div><span>首箱策略</span><b>{{ trace.selectedStrategy || "-" }}</b></div>
          <div><span>首箱已摆</span><b>{{ trace.firstBox.placedCount }} / {{ trace.parameters.unitCount }} 件</b></div>
          <div><span>箱体体积</span><b>{{ fmt(trace.current.containerVolumeM3) }} m³</b></div>
          <div><span>可用体积</span><b>{{ fmt(trace.current.usableVolumeM3) }} m³</b></div>
          <div><span>首箱占用体积</span><b>{{ fmt(trace.current.firstBoxOccupiedVolumeM3) }} m³</b></div>
          <div><span>首箱空间占用</span><b>{{ fmt(trace.current.firstBoxFillPercent, 1) }}%</b></div>
          <div><span>几何箱数</span><b>{{ trace.current.geometryBoxes }}</b></div>
          <div><span>重量箱数</span><b>{{ trace.current.weightBoxes }}</b></div>
          <div><span>最终箱数</span><b>{{ trace.current.finalBoxes }}</b></div>
        </div>
        <p v-else>当前还没有计算结果，返回装箱计算页录入货物后会在这里显示实际计算留痕。</p>
      </article>
    </div>

    <div v-if="trace" class="algorithm-note">
      <strong>Worker 工作流程</strong>
      <ol class="trace-list">
        <li v-for="step in trace.pipeline" :key="step">{{ step }}</li>
      </ol>
      <div class="strategy-list">
        <span v-for="strategy in trace.strategies" :key="strategy">{{ strategy }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  evaluation: { type: Object, default: null }
});

const fallbackFormulas = [
  "单件原始体积(m³) = 长 × 宽 × 高 ÷ 1,000,000",
  "计入间隙尺寸(cm) = 原始尺寸 + 全局货物间隙 + 类型额外间隙",
  "单件占用体积(m³) = 计入间隙长 × 计入间隙宽 × 计入间隙高 ÷ 1,000,000",
  "箱体体积(m³) = 箱长 × 箱宽 × 箱高 ÷ 1,000,000",
  "计划可用体积(m³) = 箱体体积 × 计划可用率",
  "首箱空间占用率 = 首箱已摆放占用体积 ÷ 计划可用体积 × 100%",
  "重量箱数 = ceil(总重量 ÷ 箱型载重)",
  "推荐箱数 = max(几何装箱箱数, 重量箱数)",
  "上层支撑条件 = 下方可承重重叠面积 ÷ 当前底面积 ≥ 98.5%"
];

const trace = computed(() => props.evaluation?.trace || null);
const formulas = computed(() => trace.value?.formulas?.length ? trace.value.formulas : fallbackFormulas);

function fmt(value, digits = 2) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}
</script>
