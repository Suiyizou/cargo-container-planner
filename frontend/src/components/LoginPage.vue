<template>
  <section class="admin-login-shell app-login-shell">
    <div class="admin-login-brand">
      <span class="brand-mark">CP</span>
      <p>Enterprise Login</p>
      <h1>货代装箱体积规划系统</h1>
      <strong>员工登录后进入个人工作台，管理员可进入后台管理系统。</strong>
      <div class="admin-login-points">
        <span>6 小时登录令牌</span>
        <span>个人中心面板</span>
        <span>管理员权限区分</span>
      </div>
    </div>

    <form class="admin-login-card" @submit.prevent="submit">
      <div class="admin-login-title">
        <span>账号登录</span>
        <strong>欢迎回来</strong>
      </div>
      <label>
        <span>账号</span>
        <input v-model.trim="form.username" autocomplete="username" autofocus />
      </label>
      <label>
        <span>密码</span>
        <input v-model="form.password" autocomplete="current-password" type="password" />
      </label>
      <button class="primary wide" type="submit" :disabled="loading">
        {{ loading ? "登录中..." : "登录" }}
      </button>
      <p v-if="message" class="admin-message error">{{ message }}</p>
    </form>
  </section>
</template>

<script setup>
import { reactive, ref } from "vue";
import { loginAdmin } from "../services/adminApi";

const emit = defineEmits(["logged-in"]);

const loading = ref(false);
const message = ref("");
const form = reactive({ username: "", password: "" });

async function submit() {
  if (loading.value) return;
  loading.value = true;
  message.value = "";
  try {
    const response = await loginAdmin(form.username, form.password);
    form.password = "";
    emit("logged-in", response.user);
  } catch (error) {
    message.value = error.message || "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>
