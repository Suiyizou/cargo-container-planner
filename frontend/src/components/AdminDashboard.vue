<template>
  <section class="algorithm-page admin-page">
    <div class="page-title">
      <p>Admin Console</p>
      <h2>后台管理系统</h2>
    </div>

    <div v-if="!currentUser" class="admin-login-panel">
      <form class="admin-card login-card" @submit.prevent="handleLogin">
        <strong>总管理员登录</strong>
        <label>
          <span>账号</span>
          <input v-model.trim="loginForm.username" autocomplete="username" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="loginForm.password" autocomplete="current-password" type="password" />
        </label>
        <button class="primary wide" type="submit" :disabled="loading">
          {{ loading ? "登录中..." : "登录后台" }}
        </button>
        <p v-if="message" class="admin-message error">{{ message }}</p>
      </form>
    </div>

    <template v-else>
      <div class="admin-toolbar">
        <div>
          <span>当前管理员</span>
          <strong>{{ currentUser.displayName }} / {{ currentUser.username }}</strong>
        </div>
        <div class="admin-actions">
          <button type="button" :disabled="loading" @click="loadDashboard">刷新</button>
          <button type="button" @click="handleLogout">退出登录</button>
        </div>
      </div>

      <p v-if="message" class="admin-message" :class="{ error: hasError }">{{ message }}</p>

      <div class="admin-metrics">
        <div>
          <span>员工账号</span>
          <strong>{{ monitoring?.userCount ?? "-" }}</strong>
        </div>
        <div>
          <span>在线设备</span>
          <strong>{{ monitoring?.onlineDeviceCount ?? "-" }}</strong>
        </div>
        <div>
          <span>今日登录</span>
          <strong>{{ monitoring?.loginSuccessToday ?? "-" }}</strong>
        </div>
        <div>
          <span>登录失败/限流</span>
          <strong>{{ monitoring?.loginFailToday ?? "-" }}</strong>
        </div>
        <div>
          <span>账号设备上限</span>
          <strong>{{ monitoring?.deviceLimit ?? 5 }}</strong>
        </div>
      </div>

      <div class="admin-grid">
        <article class="admin-card">
          <strong>新增员工</strong>
          <div class="admin-form-grid">
            <label>
              <span>账号</span>
              <input v-model.trim="employeeForm.username" />
            </label>
            <label>
              <span>姓名</span>
              <input v-model.trim="employeeForm.displayName" />
            </label>
            <label>
              <span>初始密码</span>
              <input v-model="employeeForm.password" type="password" />
            </label>
            <label>
              <span>角色</span>
              <select v-model="employeeForm.role">
                <option value="EMPLOYEE">员工</option>
                <option value="ADMIN">管理员</option>
              </select>
            </label>
          </div>
          <button class="primary" type="button" :disabled="loading" @click="handleCreateEmployee">创建员工</button>
        </article>

        <article class="admin-card">
          <strong>运行监控</strong>
          <div class="admin-runtime">
            <span>服务时间：{{ formatDate(monitoring?.serverTime) }}</span>
            <span>启动时间：{{ formatDate(monitoring?.runtime?.startedAt) }}</span>
            <span>请求总数：{{ monitoring?.runtime?.totalRequests ?? 0 }}</span>
            <span>异常请求：{{ monitoring?.runtime?.failedRequests ?? 0 }}</span>
            <span>堆内存：{{ monitoring?.runtime?.heapUsedMb ?? 0 }} / {{ monitoring?.runtime?.heapMaxMb ?? 0 }} MB</span>
          </div>
        </article>
      </div>

      <article class="admin-card">
        <div class="admin-card-head">
          <strong>员工管理</strong>
          <span>{{ employees.length }} 个账号</span>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>账号</th>
                <th>姓名</th>
                <th>角色</th>
                <th>状态</th>
                <th>最近登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in employees" :key="user.id">
                <td>{{ user.username }}</td>
                <td>{{ user.displayName }}</td>
                <td>{{ roleText(user.role) }}</td>
                <td><span class="admin-status" :class="{ off: user.status !== 'ACTIVE' }">{{ statusText(user.status) }}</span></td>
                <td>{{ formatDate(user.lastLoginAt) }}</td>
                <td>
                  <button type="button" @click="toggleEmployee(user)">
                    {{ user.status === "ACTIVE" ? "禁用" : "启用" }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="admin-card">
        <div class="admin-card-head">
          <strong>在线设备与登录 IP</strong>
          <span>{{ onlineDevices.length }} 台在线</span>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table devices">
            <thead>
              <tr>
                <th>用户</th>
                <th>设备</th>
                <th>IP</th>
                <th>MAC</th>
                <th>最近活跃</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="device in devices" :key="device.id">
                <td>{{ device.displayName }} / {{ device.username }}</td>
                <td>
                  <b>{{ device.deviceName || "Web 设备" }}</b>
                  <small>{{ device.deviceId }}</small>
                </td>
                <td>{{ device.ipAddress || "-" }}</td>
                <td>{{ device.macAddress || "Web 端不可读取" }}</td>
                <td>{{ formatDate(device.lastSeenAt) }}</td>
                <td><span class="admin-status" :class="{ off: !device.online }">{{ device.online ? "在线" : "离线" }}</span></td>
                <td>
                  <button type="button" :disabled="!device.online" @click="handleKickDevice(device)">踢下线</button>
                </td>
              </tr>
              <tr v-if="!devices.length">
                <td colspan="7">暂无登录设备</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <div class="admin-grid">
        <article class="admin-card">
          <strong>最近登录事件</strong>
          <ul class="admin-event-list">
            <li v-for="event in monitoring?.recentEvents || []" :key="event.id">
              <span>{{ event.eventType }}</span>
              <b>{{ event.username || "-" }}</b>
              <em>{{ event.ipAddress || "-" }}</em>
              <small>{{ formatDate(event.createdAt) }}</small>
            </li>
          </ul>
        </article>

        <article class="admin-card">
          <strong>热门接口</strong>
          <ul class="admin-event-list">
            <li v-for="endpoint in monitoring?.runtime?.topEndpoints || []" :key="endpoint.endpoint">
              <span>{{ endpoint.hits }}</span>
              <b>{{ endpoint.endpoint }}</b>
            </li>
          </ul>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  clearAdminToken,
  createEmployee,
  fetchAdminMe,
  fetchDevices,
  fetchEmployees,
  fetchMonitoring,
  kickDevice,
  loginAdmin,
  logoutAdmin,
  storedAdminToken,
  updateEmployee
} from "../services/adminApi";

const loading = ref(false);
const message = ref("");
const hasError = ref(false);
const currentUser = ref(null);
const employees = ref([]);
const devices = ref([]);
const monitoring = ref(null);
const loginForm = reactive({ username: "admin", password: "" });
const employeeForm = reactive({ username: "", displayName: "", password: "", role: "EMPLOYEE" });

const onlineDevices = computed(() => devices.value.filter((device) => device.online));

onMounted(async () => {
  if (storedAdminToken()) {
    await loadDashboard();
  }
});

async function handleLogin() {
  await withLoading(async () => {
    const response = await loginAdmin(loginForm.username, loginForm.password);
    if (response.user.role !== "ADMIN") {
      clearAdminToken();
      throw new Error("当前账号不是管理员");
    }
    currentUser.value = response.user;
    await loadDashboard(false);
    showMessage("登录成功");
  });
}

async function handleLogout() {
  await withLoading(async () => {
    await logoutAdmin();
    currentUser.value = null;
    employees.value = [];
    devices.value = [];
    monitoring.value = null;
    loginForm.password = "";
    showMessage("已退出登录");
  });
}

async function loadDashboard(showSuccess = true) {
  await withLoading(async () => {
    currentUser.value = await fetchAdminMe();
    const [employeeRows, deviceRows, monitoringData] = await Promise.all([
      fetchEmployees(),
      fetchDevices(),
      fetchMonitoring()
    ]);
    employees.value = employeeRows;
    devices.value = deviceRows;
    monitoring.value = monitoringData;
    if (showSuccess) showMessage("后台数据已刷新");
  });
}

async function handleCreateEmployee() {
  await withLoading(async () => {
    await createEmployee({ ...employeeForm });
    employeeForm.username = "";
    employeeForm.displayName = "";
    employeeForm.password = "";
    employeeForm.role = "EMPLOYEE";
    await loadDashboard(false);
    showMessage("员工已创建");
  });
}

async function toggleEmployee(user) {
  await withLoading(async () => {
    await updateEmployee(user.id, {
      displayName: user.displayName,
      role: user.role,
      status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"
    });
    await loadDashboard(false);
    showMessage(user.status === "ACTIVE" ? "员工已禁用" : "员工已启用");
  });
}

async function handleKickDevice(device) {
  await withLoading(async () => {
    await kickDevice(device.id);
    await loadDashboard(false);
    showMessage("设备已踢下线");
  });
}

async function withLoading(action) {
  loading.value = true;
  message.value = "";
  hasError.value = false;
  try {
    await action();
  } catch (error) {
    hasError.value = true;
    message.value = error.message || "操作失败";
  } finally {
    loading.value = false;
  }
}

function showMessage(text) {
  hasError.value = false;
  message.value = text;
}

function roleText(role) {
  return role === "ADMIN" ? "管理员" : "员工";
}

function statusText(status) {
  return status === "ACTIVE" ? "启用" : "禁用";
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
</script>
