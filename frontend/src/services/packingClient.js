let currentWorker = null;
let currentJobId = 0;

export function calculatePacking(payload) {
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }

  const jobId = ++currentJobId;
  currentWorker = new Worker(new URL("../workers/packingWorker.js", import.meta.url), { type: "module" });

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("本机计算超时，请减少货物数量或拆分批次计算。"));
    }, 30000);

    currentWorker.onmessage = (event) => {
      const { id, type, result, message } = event.data || {};
      if (id !== jobId) return;
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

    currentWorker.postMessage({ id: jobId, payload: toWorkerPayload(payload) });
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
