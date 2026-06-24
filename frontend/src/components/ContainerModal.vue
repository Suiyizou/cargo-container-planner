<template>
  <div class="modal-backdrop" @mousedown.self="$emit('close')">
    <section class="modal small">
      <header>
        <div>
          <p>箱型管理</p>
          <h2>添加自定义箱型</h2>
        </div>
        <button class="icon-button" type="button" @click="$emit('close')">×</button>
      </header>
      <form class="form-grid" @submit.prevent="submit">
        <label class="span-2">
          箱型名称
          <input v-model.trim="model.name" required placeholder="例如：客户定制柜" />
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
          载重 kg
          <input v-model.number="model.payloadKg" required type="number" min="1" step="1" />
        </label>
        <div class="modal-actions span-2">
          <button type="button" @click="$emit('close')">取消</button>
          <button class="primary" type="submit">加入对比</button>
        </div>
      </form>
    </section>
  </div>
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
  emit("save", { ...model, id: uid("container") });
}
</script>
