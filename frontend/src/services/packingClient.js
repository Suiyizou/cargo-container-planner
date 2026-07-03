let currentWorker = null;
let currentJobId = 0;

export function calculatePacking(payload, options = {}) {
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }

  const jobId = ++currentJobId;
  currentWorker = new Worker(new URL("../workers/packingWorker.js", import.meta.url), { type: "module" });
  const timeoutMs = packingTimeoutMs(payload);
  const onDecision = typeof options.onDecision === "function" ? options.onDecision : null;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("本机计算仍未完成，请先减少箱型数量、降低货物总件数，或拆分批次计算。"));
    }, timeoutMs);

    currentWorker.onmessage = (event) => {
      const { id, type, result, message, decisions } = event.data || {};
      if (id !== jobId) return;
      if (type === "decision") {
        onDecision?.(Array.isArray(decisions) ? decisions : []);
        return;
      }
      window.clearTimeout(timer);
      cleanup();
      if (type === "result") resolve(result);
      else reject(new Error(message || "本机计算失败"));
    };

    currentWorker.onerror = (error) => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error(error.message || "本机计算失败"));
    };

    currentWorker.postMessage({
      id: jobId,
      payload: {
        ...toWorkerPayload(payload),
        traceOptions: {
          enabled: Boolean(onDecision),
          maxEntries: Number(options.maxDecisionEntries || 240),
          batchSize: Number(options.decisionBatchSize || 12)
        }
      }
    });
  });
}

function cleanup() {
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }
}

function toWorkerPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function packingTimeoutMs(payload) {
  const estimate = estimatePackingWorkload(payload);
  return Math.min(600000, Math.max(90000, estimate.seconds * 1000 + 90000));
}

export function estimatePackingWorkload(payload = {}) {
  const cargos = payload.cargos || [];
  const containers = payload.containers || [];
  const rawUnitCount = cargos.reduce((sum, cargo) => sum + Math.max(0, Math.floor(Number(cargo.quantity || 0))), 0);
  const typeCount = cargos.length;
  const groupingEnabled = rawUnitCount >= 120;
  const solverUnitCount = cargos.reduce((sum, cargo) => {
    const quantity = Math.max(0, Math.floor(Number(cargo.quantity || 0)));
    if (groupingEnabled && quantity >= 24) return sum + Math.ceil(quantity / 4);
    return sum + quantity;
  }, 0);
  const typeFactor = Math.max(1, Math.log2(typeCount + 1));
  const diversityPenalty = typeCount >= 80 ? 2.2 : typeCount >= 40 ? 1.55 : 1;
  const containerCount = Math.max(1, containers.length);
  const score = solverUnitCount * containerCount * typeFactor * diversityPenalty;
  const seconds = Math.max(2, Math.ceil(score / 180));
  const hasGrouping = solverUnitCount < rawUnitCount;
  const level = seconds >= 90 || typeCount >= 80 ? "heavy" : seconds >= 25 || typeCount >= 40 ? "medium" : "light";
  const title = hasGrouping ? "已启用同规格块化" : "预计计算耗时";
  const detail = hasGrouping
    ? `原始 ${rawUnitCount} 件压缩为约 ${solverUnitCount} 个搜索块，预计 ${formatDuration(seconds)}。`
    : `${typeCount} 类 / ${rawUnitCount} 件 / ${containerCount} 个箱型，预计 ${formatDuration(seconds)}。`;
  const advice = typeCount >= 40
    ? "货物种类较多，算法会保留更多候选组合；可以等待，或按项目/批次拆分后再算。"
    : "数量较大时系统会优先合并同规格货物，减少浏览器计算压力。";

  return {
    level,
    title,
    detail,
    advice,
    seconds,
    durationLabel: formatDuration(seconds),
    rawUnitCount,
    solverUnitCount,
    typeCount,
    containerCount,
    hasGrouping
  };
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}
