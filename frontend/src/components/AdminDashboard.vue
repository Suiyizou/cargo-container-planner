<template>
  <section v-if="!currentUser" class="admin-login-shell">
    <div class="admin-login-brand">
      <RouterLink class="admin-back-link" to="/home">返回前台</RouterLink>
      <span class="brand-mark">CP</span>
      <p>Admin Console</p>
      <h1>企业后台管理系统</h1>
      <strong>管理员登录后可管理员工账号、在线设备、系统运行与审计记录。</strong>
      <div class="admin-login-points">
        <span>员工账号管理</span>
        <span>设备登录限制</span>
        <span>运行监控面板</span>
      </div>
    </div>

    <form class="admin-login-card" @submit.prevent="handleLogin">
      <div class="admin-login-title">
        <span>总管理员登录</span>
        <strong>后台入口</strong>
      </div>
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
  </section>

  <section v-else class="admin-console-shell">
    <aside class="admin-console-sidebar">
      <RouterLink class="admin-console-brand" to="/home">
        <span class="brand-mark">CP</span>
        <div>
          <p>Browser / Server</p>
          <strong>后台管理</strong>
        </div>
      </RouterLink>

      <div class="admin-profile-card">
        <span>当前管理员</span>
        <strong>{{ displayAdminName }}</strong>
        <small>{{ currentUser.username }} · {{ roleText(currentUser.role) }}</small>
      </div>

      <nav class="admin-console-nav">
        <button
          v-for="item in adminPages"
          :key="item.key"
          type="button"
          :class="{ active: activeAdminPage === item.key }"
          @click="activeAdminPage = item.key"
        >
          <span>{{ item.no }}</span>
          <b>{{ item.label }}</b>
          <small>{{ item.description }}</small>
        </button>
      </nav>
    </aside>

    <main class="admin-console-main">
      <header class="admin-console-topbar">
        <div>
          <p>{{ activePageMeta.eyebrow }}</p>
          <h1>{{ activePageMeta.title }}</h1>
          <span>{{ activePageMeta.subtitle }}</span>
        </div>
        <div class="admin-top-actions">
          <button type="button" :disabled="loading" @click="loadDashboard">
            {{ loading ? "刷新中..." : "刷新数据" }}
          </button>
          <button type="button" @click="handleLogout">退出登录</button>
        </div>
      </header>

      <p v-if="message" class="admin-message" :class="{ error: hasError }">{{ message }}</p>

      <section v-if="activeAdminPage === 'overview'" class="admin-page-pane">
        <div class="admin-metrics">
          <div>
            <span>员工账号</span>
            <strong>{{ monitoring?.userCount ?? "-" }}</strong>
            <small>管理员 {{ monitoring?.adminCount ?? 0 }} 个</small>
          </div>
          <div>
            <span>在线设备</span>
            <strong>{{ monitoring?.onlineDeviceCount ?? "-" }}</strong>
            <small>上限 {{ monitoring?.deviceLimit ?? 5 }} 台/账号</small>
          </div>
          <div>
            <span>今日登录</span>
            <strong>{{ monitoring?.loginSuccessToday ?? "-" }}</strong>
            <small>成功会话</small>
          </div>
          <div>
            <span>登录异常</span>
            <strong>{{ monitoring?.loginFailToday ?? "-" }}</strong>
            <small>失败/限流</small>
          </div>
          <div>
            <span>接口请求</span>
            <strong>{{ monitoring?.runtime?.totalRequests ?? 0 }}</strong>
            <small>失败 {{ monitoring?.runtime?.failedRequests ?? 0 }}</small>
          </div>
        </div>

        <div class="admin-dashboard-grid">
          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Runtime</p>
                <h2>运行监控</h2>
              </div>
              <span class="admin-health-pill" :class="{ warn: runtimeHasFailedRequests }">
                {{ runtimeHealthLabel }}
              </span>
            </div>
            <div class="admin-runtime-list">
              <span><b>服务时间</b>{{ formatDate(monitoring?.serverTime) }}</span>
              <span><b>启动时间</b>{{ formatDate(monitoring?.runtime?.startedAt) }}</span>
              <span><b>堆内存</b>{{ monitoring?.runtime?.heapUsedMb ?? 0 }} / {{ monitoring?.runtime?.heapMaxMb ?? 0 }} MB</span>
              <span><b>内存占用</b>{{ heapPercent }}%</span>
            </div>
          </article>

          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Recent Events</p>
                <h2>最近登录事件</h2>
              </div>
              <button type="button" @click="activeAdminPage = 'audit'">查看审计</button>
            </div>
            <ul class="admin-activity-list">
              <li v-for="event in recentEvents" :key="event.id">
                <span :class="eventClass(event.eventType)">{{ eventTypeText(event.eventType) }}</span>
                <b>{{ event.username || "-" }}</b>
                <small>{{ event.ipAddress || "-" }}</small>
                <em>{{ formatDate(event.createdAt) }}</em>
              </li>
              <li v-if="!recentEvents.length" class="admin-empty-row">暂无登录事件</li>
            </ul>
          </article>
        </div>
      </section>

      <section v-else-if="activeAdminPage === 'employees'" class="admin-page-pane">
        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Account List</p>
              <h2>员工管理</h2>
            </div>
            <div class="admin-inline-actions">
              <span>{{ employees.length }} 个账号</span>
              <button class="primary" type="button" @click="openEmployeeDialog()">新增员工</button>
              <button type="button" @click="loadDashboard">刷新</button>
            </div>
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
                <tr v-for="user in normalizedEmployees" :key="user.id">
                  <td>{{ user.username }}</td>
                  <td>{{ user.displayName }}</td>
                  <td>{{ roleText(user.role) }}</td>
                  <td>
                    <span class="admin-status" :class="{ off: user.status !== 'ACTIVE' }">
                      {{ statusText(user.status) }}
                    </span>
                  </td>
                  <td>{{ formatDate(user.lastLoginAt) }}</td>
                  <td>
                    <div class="table-actions">
                      <button type="button" @click="handleResetPassword(user)">重置密码</button>
                      <button type="button" @click="toggleEmployee(user)">
                        {{ user.status === "ACTIVE" ? "禁用" : "启用" }}
                      </button>
                      <button class="danger ghost" type="button" :disabled="user.id === currentUser?.id" @click="handleDeleteEmployee(user)">删除</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!employees.length">
                  <td colspan="6">暂无员工账号</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'devices'" class="admin-page-pane">
        <div class="admin-metrics compact">
          <div>
            <span>当前在线</span>
            <strong>{{ onlineDevices.length }}</strong>
            <small>可手动踢下线</small>
          </div>
          <div>
            <span>设备记录</span>
            <strong>{{ devices.length }}</strong>
            <small>最近 200 条</small>
          </div>
          <div>
            <span>设备上限</span>
            <strong>{{ monitoring?.deviceLimit ?? 5 }}</strong>
            <small>每个账号</small>
          </div>
        </div>

        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Login Devices</p>
              <h2>在线设备与登录 IP</h2>
            </div>
          </div>
          <div class="admin-table-wrap">
            <table class="admin-table devices">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>设备</th>
                  <th>IP</th>
                  <th>MAC</th>
                  <th>登录时间</th>
                  <th>最近活跃</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="device in normalizedDevices" :key="device.id">
                  <td>{{ device.displayName }} / {{ device.username }}</td>
                  <td>
                    <b>{{ device.deviceName || "Web 设备" }}</b>
                    <small>{{ device.deviceId }}</small>
                  </td>
                  <td>{{ device.ipAddress || "-" }}</td>
                  <td>{{ device.macAddress || "Web 端不可读取" }}</td>
                  <td>{{ formatDate(device.loggedInAt) }}</td>
                  <td>{{ formatDate(device.lastSeenAt) }}</td>
                  <td>
                    <span class="admin-status" :class="{ off: !device.online }">
                      {{ device.online ? "在线" : "离线" }}
                    </span>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button type="button" :disabled="!device.online" @click="handleKickDevice(device)">踢下线</button>
                      <button class="danger ghost" type="button" @click="handleDeleteDevice(device)">删除设备</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!devices.length">
                  <td colspan="8">暂无登录设备</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'files'" class="admin-page-pane">
        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Workspace Files</p>
              <h2>{{ ui('admin.files.title') }}</h2>
            </div>
            <div class="admin-inline-actions">
              <label class="admin-files-expired-filter">
                <input v-model="includeExpiredFiles" type="checkbox" @change="loadAdminWorkspaceFiles" />
                <span>{{ ui('admin.files.includeExpired') }}</span>
              </label>
              <span>{{ ui('admin.files.total', { count: adminWorkspaceFileTotal }) }}</span>
              <button type="button" @click="loadAdminWorkspaceFiles">{{ ui('admin.files.refresh') }}</button>
            </div>
          </div>
          <div class="admin-table-wrap">
            <table class="admin-table admin-files-table">
              <thead>
                <tr>
                  <th>{{ ui('admin.files.user') }}</th>
                  <th>{{ ui('admin.files.fileName') }}</th>
                  <th>{{ ui('admin.files.size') }}</th>
                  <th>{{ ui('admin.files.uploadedAt') }}</th>
                  <th>{{ ui('admin.files.expiresAt') }}</th>
                  <th>{{ ui('admin.files.status') }}</th>
                  <th>{{ ui('admin.files.action') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="file in adminWorkspaceFiles" :key="file.id">
                  <td>
                    <b>{{ file.ownerDisplayName || '-' }}</b>
                    <small>ID {{ file.userId || '-' }}</small>
                  </td>
                  <td>
                    <b>{{ file.originalFileName }}</b>
                    <small>{{ file.source || '-' }}</small>
                  </td>
                  <td>{{ formatFileSize(file.sizeBytes) }}</td>
                  <td>{{ formatDate(file.uploadedAt) }}</td>
                  <td>{{ formatDate(file.expiresAt) }}</td>
                  <td>
                    <span class="admin-status" :class="{ off: file.expired }">
                      {{ ui(file.expired ? 'admin.files.expired' : 'admin.files.active') }}
                    </span>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button type="button" :disabled="file.expired" @click="handleDownloadWorkspaceFile(file)">{{ ui('admin.files.download') }}</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!adminWorkspaceFiles.length">
                  <td colspan="7">{{ ui('admin.files.empty') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section v-else-if="activeAdminPage === 'system'" class="admin-page-pane">
        <div class="admin-dashboard-grid">
          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Security Policy</p>
                <h2>账号与设备策略</h2>
              </div>
            </div>
            <div class="admin-setting-list">
              <span><b>单账号设备上限</b>{{ monitoring?.deviceLimit ?? 5 }} 台</span>
              <span><b>登录凭证</b>X-Auth-Token 会话令牌</span>
              <span><b>MAC 地址</b>浏览器无法直接读取，后续桌面客户端可补齐</span>
              <span><b>超限处理</b>达到上限后拒绝新设备登录</span>
            </div>
          </article>

          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Service Status</p>
                <h2>服务状态</h2>
              </div>
            </div>
            <div class="admin-setting-list">
              <span><b>后端接口</b>/api/auth 与 /api/admin</span>
              <span><b>服务时间</b>{{ formatDate(monitoring?.serverTime) }}</span>
              <span><b>请求总数</b>{{ monitoring?.runtime?.totalRequests ?? 0 }}</span>
              <span><b>异常请求</b>{{ monitoring?.runtime?.failedRequests ?? 0 }}</span>
            </div>
          </article>
        </div>

        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>LLM Settings</p>
              <h2>智能识别模型配置</h2>
            </div>
            <span class="admin-health-pill" :class="{ warn: !llmSettings?.enabled || !llmSettings?.apiKeyConfigured }">
              {{ llmStatusText }}
            </span>
          </div>
          <form class="admin-form-grid llm-settings-form" @submit.prevent="handleUpdateLlmSettings">
            <label class="admin-toggle-row">
              <span>启用 LLM 智能识别</span>
              <input v-model="llmForm.enabled" type="checkbox" />
            </label>
            <label>
              <span>Base URL</span>
              <input v-model.trim="llmForm.baseUrl" placeholder="https://api.deepseek.com" />
            </label>
            <label>
              <span>模型名称</span>
              <input v-model.trim="llmForm.model" placeholder="deepseek-v4-flash" />
            </label>
            <label>
              <span>API Key</span>
              <input v-model.trim="llmForm.apiKey" autocomplete="off" type="password" placeholder="留空则保留当前密钥" />
            </label>
            <label class="admin-toggle-row">
              <span>清空当前 API Key</span>
              <input v-model="llmForm.clearApiKey" type="checkbox" />
            </label>
            <div class="admin-setting-list llm-current-settings">
              <span><b>当前提供方</b>{{ llmSettings?.provider || "OpenAI-compatible HTTP" }}</span>
              <span><b>当前模型</b>{{ llmSettings?.model || "-" }}</span>
              <span><b>Key 状态</b>{{ llmSettings?.apiKeyConfigured ? `已配置 ${llmSettings.apiKeyPreview}` : "未配置" }}</span>
              <span><b>默认行为</b>开启但无 Key 时自动使用规则兜底</span>
            </div>
            <div class="admin-form-actions">
              <button class="primary" type="submit" :disabled="loading">保存 LLM 配置</button>
            </div>
          </form>
        </article>

        <article class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <p>Operations</p>
              <h2>系统管理预留</h2>
            </div>
          </div>
          <div class="admin-operation-grid">
            <button type="button" disabled>修改设备上限</button>
            <button type="button" disabled>数据备份</button>
            <button type="button" disabled>清理离线会话</button>
            <button type="button" disabled>系统公告</button>
          </div>
          <p class="admin-hint">这些操作入口先保留在后台面板里，后续接数据库配置和权限审计时再打开。</p>
        </article>
      </section>

      <section v-else class="admin-page-pane">
        <div class="admin-dashboard-grid">
          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Audit Trail</p>
                <h2>登录审计</h2>
              </div>
            </div>
            <ul class="admin-activity-list audit">
              <li v-for="event in recentEvents" :key="event.id">
                <span :class="eventClass(event.eventType)">{{ eventTypeText(event.eventType) }}</span>
                <b>{{ event.username || "-" }}</b>
                <small>{{ event.ipAddress || "-" }}</small>
                <em>{{ event.message || "-" }}</em>
                <strong>{{ formatDate(event.createdAt) }}</strong>
              </li>
              <li v-if="!recentEvents.length" class="admin-empty-row">暂无审计记录</li>
            </ul>
          </article>

          <article class="admin-panel">
            <div class="admin-panel-head">
              <div>
                <p>Hot Endpoints</p>
                <h2>接口访问排行</h2>
              </div>
            </div>
            <div class="admin-table-wrap">
              <table class="admin-table endpoints">
                <thead>
                  <tr>
                    <th>接口</th>
                    <th>请求数</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="endpoint in topEndpoints" :key="endpoint.endpoint">
                    <td>{{ endpoint.endpoint }}</td>
                    <td>{{ endpoint.hits }}</td>
                  </tr>
                  <tr v-if="!topEndpoints.length">
                    <td colspan="2">暂无接口统计</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </main>

    <div v-if="employeeDialogOpen" class="modal-backdrop">
      <div class="modal employee-modal">
        <header>
          <div>
            <p>Employee Account</p>
            <h2>新增员工</h2>
          </div>
          <button type="button" @click="closeEmployeeDialog">×</button>
        </header>
        <form class="admin-form-grid employee-dialog-form" @submit.prevent="handleSaveEmployee">
          <label>
            <span>账号</span>
            <input v-model.trim="employeeForm.username" placeholder="例如 zhangsan" />
          </label>
          <label>
            <span>姓名</span>
            <input v-model.trim="employeeForm.displayName" placeholder="例如 张三" />
          </label>
          <label>
            <span>初始密码</span>
            <input v-model="employeeForm.password" type="password" placeholder="至少 8 位" />
          </label>
          <label>
            <span>角色</span>
            <select v-model="employeeForm.role">
              <option value="EMPLOYEE">员工</option>
              <option value="ADMIN">管理员</option>
            </select>
          </label>
          <label>
            <span>状态</span>
            <select v-model="employeeForm.status">
              <option value="ACTIVE">启用</option>
              <option value="DISABLED">禁用</option>
            </select>
          </label>
          <div class="modal-actions">
            <button type="button" @click="closeEmployeeDialog">取消</button>
            <button class="primary" type="submit" :disabled="loading">创建员工</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  clearAdminToken,
  createEmployee,
  deleteDevice,
  deleteEmployee,
  fetchAdminMe,
  fetchAdminWorkspaceFiles,
  fetchDevices,
  fetchEmployees,
  fetchLlmSettings,
  fetchMonitoring,
  kickDevice,
  loginAdmin,
  resetEmployeePassword,
  storedAdminToken,
  downloadAdminWorkspaceFile,
  updateEmployee,
  updateLlmSettings
} from "../services/adminApi";
import { currentLocale } from "../i18n";
import { translateLegacyText } from "../i18n/legacyText";
import { translateUiText } from "../i18n/uiText";

const props = defineProps({
  currentUser: { type: Object, default: null }
});
const emit = defineEmits(["logout", "user-updated"]);

const rawAdminPages = [
  { key: "overview", no: "01", label: "后台概览", description: "指标与运行监控", eyebrow: "Admin Console", title: "后台总览", subtitle: "查看账号、设备、接口运行的关键状态。" },
  { key: "employees", no: "02", label: "员工管理", description: "账号与角色", eyebrow: "Employee Management", title: "员工管理", subtitle: "创建员工账号，调整角色与启用状态。" },
  { key: "devices", no: "03", label: "设备登录", description: "IP 与在线设备", eyebrow: "Device Sessions", title: "设备与登录", subtitle: "查看当前登录设备、IP、会话状态并执行下线。" },
  { key: "files", no: "04", labelKey: "admin.files.navLabel", descriptionKey: "admin.files.navDescription", eyebrow: "Workspace Files", titleKey: "admin.files.title", subtitleKey: "admin.files.subtitle" },
  { key: "system", no: "05", label: "\u7cfb\u7edf\u7ba1\u7406", description: "\u7b56\u7565\u4e0e\u670d\u52a1\u72b6\u6001", eyebrow: "System Settings", title: "\u7cfb\u7edf\u7ba1\u7406", subtitle: "\u96c6\u4e2d\u653e\u7f6e\u8d26\u53f7\u7b56\u7565\u3001\u670d\u52a1\u72b6\u6001\u548c\u540e\u7eed\u8fd0\u7ef4\u5165\u53e3\u3002" },
  { key: "audit", no: "06", label: "审计日志", description: "登录与接口记录", eyebrow: "Audit Log", title: "审计日志", subtitle: "追踪登录事件和接口访问热度。" }
];

const loading = ref(false);
const message = ref("");
const hasError = ref(false);
const currentUser = ref(props.currentUser);
const employees = ref([]);
const devices = ref([]);
const adminWorkspaceFiles = ref([]);
const adminWorkspaceFileTotal = ref(0);
const includeExpiredFiles = ref(false);
const monitoring = ref(null);
const llmSettings = ref(null);
const activeAdminPage = ref("overview");
const loginForm = reactive({ username: "admin", password: "" });
const employeeDialogOpen = ref(false);
const employeeForm = reactive({ username: "", displayName: "", password: "", role: "EMPLOYEE", status: "ACTIVE" });
const llmForm = reactive({
  enabled: true,
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
  clearApiKey: false
});

const adminPages = computed(() => rawAdminPages.map((item) => ({
  ...item,
  label: item.labelKey ? ui(item.labelKey) : tr(item.label),
  description: item.descriptionKey ? ui(item.descriptionKey) : tr(item.description),
  title: item.titleKey ? ui(item.titleKey) : tr(item.title),
  subtitle: item.subtitleKey ? ui(item.subtitleKey) : tr(item.subtitle)
})));
const activePageMeta = computed(() =>
  adminPages.value.find((item) => item.key === activeAdminPage.value) || adminPages.value[0]
);
const displayAdminName = computed(() => repairMojibake(currentUser.value?.displayName || "管理员"));
const normalizedEmployees = computed(() => employees.value.map(normalizeDisplayName));
const normalizedDevices = computed(() => devices.value.map(normalizeDisplayName));
const onlineDevices = computed(() => normalizedDevices.value.filter((device) => device.online));
const recentEvents = computed(() => monitoring.value?.recentEvents || []);
const topEndpoints = computed(() => monitoring.value?.runtime?.topEndpoints || []);
const runtimeFailedRequestCount = computed(() => Number(monitoring.value?.runtime?.failedRequests || 0));
const runtimeHasFailedRequests = computed(() => runtimeFailedRequestCount.value > 0);
const runtimeHealthLabel = computed(() =>
  runtimeHasFailedRequests.value
    ? ui("admin.runtimeHasFailedRequests", { count: runtimeFailedRequestCount.value })
    : ui("admin.runtimeRunningNormally")
);
const llmStatusText = computed(() => {
  if (!llmSettings.value) return tr("未加载");
  if (!llmSettings.value.enabled) return tr("已关闭");
  return tr(llmSettings.value.apiKeyConfigured ? "已启用" : "缺少 Key");
});
const heapPercent = computed(() => {
  const used = Number(monitoring.value?.runtime?.heapUsedMb || 0);
  const max = Number(monitoring.value?.runtime?.heapMaxMb || 0);
  if (!max) return 0;
  return Math.round((used / max) * 100);
});

onMounted(async () => {
  if (storedAdminToken()) {
    await loadDashboard(false);
  }
});

watch(() => props.currentUser, (user) => {
  currentUser.value = user;
}, { immediate: true });

async function handleLogin() {
  if (loading.value) return;
  await withLoading(async () => {
    const response = await loginAdmin(loginForm.username, loginForm.password);
    if (response.user.role !== "ADMIN") {
      clearAdminToken();
      throw new Error("当前账号不是管理员");
    }
    currentUser.value = normalizeDisplayName(response.user);
    await loadDashboard(false);
    showMessage("登录成功");
  });
}

async function handleLogout() {
  emit("logout");
}

async function loadDashboard(showSuccess = true) {
  await withLoading(async () => {
    currentUser.value = normalizeDisplayName(await fetchAdminMe());
    emit("user-updated", currentUser.value);
    const [employeeRows, deviceRows, monitoringData, llmData, workspaceFileData] = await Promise.all([
      fetchEmployees(),
      fetchDevices(),
      fetchMonitoring(),
      fetchLlmSettings(),
      fetchAdminWorkspaceFiles({ page: 0, size: 200, includeExpired: includeExpiredFiles.value })
        .catch(() => null)
    ]);
    employees.value = employeeRows;
    devices.value = deviceRows;
    monitoring.value = monitoringData;
    llmSettings.value = llmData;
    if (workspaceFileData) {
      adminWorkspaceFiles.value = Array.isArray(workspaceFileData.items) ? workspaceFileData.items : [];
      adminWorkspaceFileTotal.value = Number(workspaceFileData.total ?? adminWorkspaceFiles.value.length);
    }
    syncLlmForm(llmData);
    if (showSuccess) showMessage("后台数据已刷新");
  });
}

function openEmployeeDialog() {
  employeeForm.username = "";
  employeeForm.displayName = "";
  employeeForm.password = "";
  employeeForm.role = "EMPLOYEE";
  employeeForm.status = "ACTIVE";
  employeeDialogOpen.value = true;
}

function closeEmployeeDialog() {
  employeeDialogOpen.value = false;
  employeeForm.username = "";
  employeeForm.displayName = "";
  employeeForm.password = "";
  employeeForm.role = "EMPLOYEE";
  employeeForm.status = "ACTIVE";
}

async function handleSaveEmployee() {
  await withLoading(async () => {
    await createEmployee({ ...employeeForm });
    closeEmployeeDialog();
    await loadDashboard(false);
    showMessage("员工已创建");
  });
}

async function handleResetPassword(user) {
  if (!window.confirm(`确认将账号「${user.username}」密码重置为 123456 吗？该账号已登录设备会下线。`)) return;
  await withLoading(async () => {
    await resetEmployeePassword(user.id);
    await loadDashboard(false);
    showMessage(`账号 ${user.username} 的密码已重置为 123456`);
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

async function handleDeleteEmployee(user) {
  if (!window.confirm(`确认删除/禁用账号「${user.username}」吗？`)) return;
  await withLoading(async () => {
    await deleteEmployee(user.id);
    await loadDashboard(false);
    showMessage("员工已删除并下线");
  });
}

async function handleKickDevice(device) {
  await withLoading(async () => {
    await kickDevice(device.id);
    await loadDashboard(false);
    showMessage("设备已踢下线");
  });
}

async function handleDeleteDevice(device) {
  const deviceName = device.deviceName || device.deviceId || device.ipAddress || "该设备";
  if (!window.confirm(`确认删除设备记录「${deviceName}」吗？在线设备会同步下线。`)) return;
  await withLoading(async () => {
    await deleteDevice(device.id);
    await loadDashboard(false);
    showMessage("设备记录已删除");
  });
}

async function loadAdminWorkspaceFiles() {
  await withLoading(async () => {
    const response = await fetchAdminWorkspaceFiles({
      page: 0,
      size: 200,
      includeExpired: includeExpiredFiles.value
    });
    adminWorkspaceFiles.value = Array.isArray(response?.items) ? response.items : [];
    adminWorkspaceFileTotal.value = Number(response?.total ?? adminWorkspaceFiles.value.length);
  });
}

async function handleDownloadWorkspaceFile(file) {
  await withLoading(async () => {
    await downloadAdminWorkspaceFile(file.id, file.originalFileName || `workspace-${file.id}.xlsx`);
  });
}

async function handleUpdateLlmSettings() {
  await withLoading(async () => {
    const payload = {
      enabled: llmForm.enabled,
      baseUrl: llmForm.baseUrl,
      model: llmForm.model,
      clearApiKey: llmForm.clearApiKey
    };
    if (llmForm.apiKey) payload.apiKey = llmForm.apiKey;
    const next = await updateLlmSettings(payload);
    llmSettings.value = next;
    syncLlmForm(next);
    showMessage("LLM 配置已保存");
  });
}

function syncLlmForm(settings) {
  llmForm.enabled = settings?.enabled ?? true;
  llmForm.baseUrl = settings?.baseUrl || "https://api.deepseek.com";
  llmForm.model = settings?.model || "deepseek-v4-flash";
  llmForm.apiKey = "";
  llmForm.clearApiKey = false;
}

async function withLoading(action) {
  loading.value = true;
  message.value = "";
  hasError.value = false;
  try {
    await action();
  } catch (error) {
    hasError.value = true;
    message.value = tr(error.message || "操作失败");
  } finally {
    loading.value = false;
  }
}

function showMessage(text) {
  hasError.value = false;
  message.value = tr(text);
}

function normalizeDisplayName(record) {
  if (!record) return record;
  return { ...record, displayName: repairMojibake(record.displayName || "未命名") };
}

function repairMojibake(value) {
  const text = String(value || "");
  if (!/[ÃÂæçå€˜™œ]/.test(text)) return text;
  try {
    const bytes = [];
    for (const ch of text) {
      const code = CP1252_BYTES[ch] ?? ch.charCodeAt(0);
      if (code > 255) return text;
      bytes.push(code);
    }
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
    return hasMoreChinese(decoded, text) ? decoded : text;
  } catch {
    return text;
  }
}

function hasMoreChinese(next, prev) {
  return countChinese(next) > countChinese(prev) && !next.includes("�");
}

function countChinese(text) {
  return (String(text).match(/[\u3400-\u9fff]/g) || []).length;
}

function roleText(role) {
  return tr(role === "ADMIN" ? "管理员" : "员工");
}

function statusText(status) {
  return tr(status === "ACTIVE" ? "启用" : "禁用");
}

function eventTypeText(type) {
  const labels = {
    LOGIN_SUCCESS: "登录成功",
    LOGIN_FAIL: "登录失败",
    LOGOUT: "退出登录",
    KICK: "踢下线",
    RESET_PASSWORD: "重置密码",
    DELETE_DEVICE: "删除设备",
    DEVICE_LIMIT: "设备限流"
  };
  return tr(labels[type] || type || "-");
}

function eventClass(type) {
  return {
    LOGIN_SUCCESS: "ok",
    LOGOUT: "neutral",
    LOGIN_FAIL: "danger",
    DEVICE_LIMIT: "warn",
    KICK: "warn",
    RESET_PASSWORD: "warn",
    DELETE_DEVICE: "danger"
  }[type] || "neutral";
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(currentLocale.value === "en-US" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function tr(value) {
  return translateLegacyText(value, currentLocale.value);
}

function ui(key, params) {
  return translateUiText(key, currentLocale.value, params);
}

const CP1252_BYTES = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f
};
</script>
