export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = ["zh-CN", "en-US"];

export const localeOptions = [
  { value: "zh-CN", label: "中文", shortLabel: "中" },
  { value: "en-US", label: "English", shortLabel: "EN" }
];

export const messages = {
  "zh-CN": {
    language: {
      label: "语言",
      chinese: "中文",
      english: "English"
    },
    app: {
      name: "货代装箱体积规划系统",
      workspace: "工作台",
      loadingAuth: "正在检查登录状态..."
    }
  },
  "en-US": {
    language: {
      label: "Language",
      chinese: "Chinese",
      english: "English"
    },
    app: {
      name: "Cargo Container Planning System",
      workspace: "Workspace",
      loadingAuth: "Checking login status..."
    }
  }
};
