<template>
  <el-dialog
    :model-value="true"
    class="planner-dialog"
    width="640px"
    align-center
    destroy-on-close
    @close="$emit('close')"
  >
    <template #header>
      <div class="dialog-title">
        <p>货物录入</p>
        <h2>{{ model.id ? "编辑货物" : "新增货物" }}</h2>
      </div>
    </template>
    <el-form :model="model" label-position="top" class="element-form-grid">
      <el-form-item class="span-2" label="名称" required>
        <el-input v-model.trim="model.name" placeholder="例如：纸箱 A" clearable />
      </el-form-item>
      <el-form-item class="span-2" label="型号/规格">
        <el-input v-model.trim="model.model" placeholder="可选，例如：100 / 200 / A款" clearable />
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
      <el-form-item label="数量" required>
        <el-input-number v-model="model.quantity" :min="1" :step="1" :precision="0" controls-position="right" />
      </el-form-item>
      <el-form-item label="单重 kg" required>
        <el-input-number v-model="model.weightKg" :min="0" :step="0.1" :precision="1" controls-position="right" />
      </el-form-item>
      <el-form-item label="摆放规则">
        <el-select v-model="model.type">
          <el-option label="普通货物，可旋转" value="normal" />
          <el-option label="保持朝上" value="upright" />
          <el-option label="不可重压" value="nonstack" />
          <el-option label="托盘/异形货" value="pallet" />
        </el-select>
      </el-form-item>
      <el-form-item class="span-2" label="颜色设置">
        <div class="element-color-row">
          <el-color-picker v-model="colorValue" />
          <el-tag effect="plain">{{ model.color ? "已自定义颜色" : "系统自动推荐颜色" }}</el-tag>
          <el-button :icon="RefreshLeft" @click="useAutoColor">使用系统推荐色</el-button>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="submit">{{ model.id ? "保存修改" : "添加货物" }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, watch } from "vue";
import { RefreshLeft } from "@element-plus/icons-vue";
import { uid } from "../utils/format";

const props = defineProps({ cargo: { type: Object, default: null } });
const emit = defineEmits(["close", "save"]);

const model = reactive(defaultCargo());
const colorValue = computed({
  get: () => model.color || "#4e8fd0",
  set: (value) => {
    model.color = value;
  }
});

watch(
  () => props.cargo,
  (cargo) => Object.assign(model, cargo ? { ...cargo } : defaultCargo()),
  { immediate: true }
);

function defaultCargo() {
  return {
    id: "",
    name: "",
    model: "",
    lengthCm: 60,
    widthCm: 40,
    heightCm: 35,
    quantity: 10,
    weightKg: 12,
    type: "normal",
    color: ""
  };
}

function useAutoColor() {
  model.color = "";
}

function submit() {
  if (!String(model.name || "").trim()) return;
  emit("save", { ...model, id: model.id || uid("cargo") });
}
</script>
