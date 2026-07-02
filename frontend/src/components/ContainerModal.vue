<template>
  <el-dialog
    :model-value="true"
    class="planner-dialog"
    width="520px"
    align-center
    destroy-on-close
    @close="$emit('close')"
  >
    <template #header>
      <div class="dialog-title">
        <p>箱型管理</p>
        <h2>{{ isEdit ? "编辑箱型尺寸" : "添加自定义箱型" }}</h2>
      </div>
    </template>
    <el-form :model="model" label-position="top" class="element-form-grid">
      <el-form-item class="span-2" label="箱型名称" required>
        <el-input v-model.trim="model.name" placeholder="例如：客户定制柜" clearable />
      </el-form-item>
      <el-form-item label="长 cm" required>
        <el-input-number v-model="model.lengthCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="宽 cm" required>
        <el-input-number v-model="model.widthCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="高 cm" required>
        <el-input-number v-model="model.heightCm" :min="1" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="载重 kg" required>
        <el-input-number v-model="model.payloadKg" :min="1" :step="1" :precision="0" controls-position="right" />
      </el-form-item>
      <el-form-item label="使用属性">
        <el-select v-model="model.usagePriority" placeholder="选择使用属性">
          <el-option label="常用箱型" value="common" />
          <el-option label="少量使用" value="limited" />
          <el-option label="特殊设备" value="special" />
        </el-select>
      </el-form-item>
      <el-form-item class="span-2">
        <el-checkbox v-model="model.ignoreHeightLimit">平板/超限设备不按箱体高度硬拦截</el-checkbox>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="submit">{{ isEdit ? "保存尺寸" : "加入对比" }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive } from "vue";
import { uid } from "../utils/format";

const emit = defineEmits(["close", "save"]);
const props = defineProps({
  container: { type: Object, default: null }
});
const isEdit = computed(() => Boolean(props.container?.id));
const model = reactive({
  id: props.container?.id || "",
  name: props.container?.name || "",
  lengthCm: Number(props.container?.lengthCm || 590),
  widthCm: Number(props.container?.widthCm || 235),
  heightCm: Number(props.container?.heightCm || 239),
  payloadKg: Number(props.container?.payloadKg || 28000),
  usagePriority: props.container?.usagePriority || "common",
  visualKind: props.container?.visualKind || "",
  ignoreHeightLimit: Boolean(props.container?.ignoreHeightLimit),
  costFactor: props.container?.costFactor,
  priceTier: props.container?.priceTier,
  equipmentClass: props.container?.equipmentClass,
  dimensionSource: props.container?.dimensionSource || "用户自定义",
  dimensionSourceUrl: props.container?.dimensionSourceUrl || "",
  dimensionBasis: props.container?.dimensionBasis || "手动录入尺寸",
  dimensionNote: props.container?.dimensionNote || "用户自定义箱型，请按实际设备复核。"
});

function submit() {
  if (!String(model.name || "").trim()) return;
  emit("save", { ...model, id: model.id || uid("container") });
}
</script>
