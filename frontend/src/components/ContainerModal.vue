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
        <h2>添加自定义箱型</h2>
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
    </el-form>
    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" @click="submit">加入对比</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive } from "vue";
import { uid } from "../utils/format";

const emit = defineEmits(["close", "save"]);
const model = reactive({
  name: "",
  lengthCm: 590,
  widthCm: 235,
  heightCm: 239,
  payloadKg: 28000
});

function submit() {
  if (!String(model.name || "").trim()) return;
  emit("save", { ...model, id: uid("container") });
}
</script>
