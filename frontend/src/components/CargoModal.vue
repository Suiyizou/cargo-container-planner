<template>
  <div class="modal-backdrop" @mousedown.self="$emit('close')">
    <section class="modal">
      <header>
        <div>
          <p>货物录入</p>
          <h2>{{ model.id ? "编辑货物" : "新增货物" }}</h2>
        </div>
        <button class="icon-button" type="button" @click="$emit('close')">×</button>
      </header>
      <form class="form-grid" @submit.prevent="submit">
        <label class="span-2">
          名称
          <input v-model.trim="model.name" required placeholder="例如：纸箱 A" />
        </label>
        <label>
          长 cm
          <input v-model.number="model.lengthCm" required type="number" min="1" step="0.1" />
        </label>
        <label>
          宽 cm
          <input v-model.number="model.widthCm" required type="number" min="1" step="0.1" />
        </label>
        <label>
          高 cm
          <input v-model.number="model.heightCm" required type="number" min="1" step="0.1" />
        </label>
        <label>
          数量
          <input v-model.number="model.quantity" required type="number" min="1" step="1" />
        </label>
        <label>
          单重 kg
          <input v-model.number="model.weightKg" required type="number" min="0" step="0.1" />
        </label>
        <label>
          摆放规则
          <select v-model="model.type">
            <option value="normal">普通货物，可旋转</option>
            <option value="upright">保持朝上</option>
            <option value="nonstack">不可重压</option>
            <option value="pallet">托盘/异形货</option>
          </select>
        </label>
        <label>
          显示颜色
          <input v-model="model.color" type="color" />
        </label>
        <div class="modal-actions span-2">
          <button type="button" @click="$emit('close')">取消</button>
          <button class="primary" type="submit">{{ model.id ? "保存修改" : "添加货物" }}</button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup>
import { reactive, watch } from "vue";
import { uid } from "../utils/format";

const props = defineProps({ cargo: { type: Object, default: null } });
const emit = defineEmits(["close", "save"]);

const model = reactive(defaultCargo());

watch(
  () => props.cargo,
  (cargo) => Object.assign(model, cargo ? { ...cargo } : defaultCargo()),
  { immediate: true }
);

function defaultCargo() {
  return {
    id: "",
    name: "",
    lengthCm: 60,
    widthCm: 40,
    heightCm: 35,
    quantity: 10,
    weightKg: 12,
    type: "normal",
    color: "#4e8fd0"
  };
}

function submit() {
  emit("save", { ...model, id: model.id || uid("cargo") });
}
</script>
