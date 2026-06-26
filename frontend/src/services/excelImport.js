import * as XLSX from "xlsx";

const STANDARD_FIELDS = [
  { key: "name", label: "货物名称", required: true },
  { key: "model", label: "型号/规格", required: false },
  { key: "lengthCm", label: "长度 cm", required: true },
  { key: "widthCm", label: "宽度 cm", required: true },
  { key: "heightCm", label: "高度 cm", required: true },
  { key: "quantity", label: "数量", required: true },
  { key: "weightKg", label: "单件重量 kg", required: true },
  { key: "totalWeightKg", label: "总重量 kg", required: false },
  { key: "type", label: "货物类型", required: false },
  { key: "color", label: "颜色", required: false },
  { key: "id", label: "货物 ID/SKU", required: false },
  { key: "remark", label: "备注", required: false },
  { key: "dimensionText", label: "合并尺寸", required: false }
];

const FIELD_ALIASES = {
  name: ["name", "cargo", "cargoName", "goods", "goodsName", "product", "货物", "货物名称", "货名", "名称", "品名", "产品名称", "箱名", "物品名称"],
  model: ["model", "specModel", "variant", "型号", "规格型号", "产品型号", "货物型号", "型号规格"],
  lengthCm: ["lengthCm", "length", "l", "长", "长度", "外长", "长cm", "长度cm", "长厘米", "长mm", "长度mm", "长毫米", "长m", "长度m"],
  widthCm: ["widthCm", "width", "w", "宽", "宽度", "外宽", "宽cm", "宽度cm", "宽厘米", "宽mm", "宽度mm", "宽毫米", "宽m", "宽度m"],
  heightCm: ["heightCm", "height", "h", "高", "高度", "外高", "高cm", "高度cm", "高厘米", "高mm", "高度mm", "高毫米", "高m", "高度m"],
  quantity: ["quantity", "qty", "count", "num", "pcs", "数量", "件数", "箱数", "个数", "数量pcs", "总件数"],
  weightKg: ["weightKg", "unitWeight", "unitWeightKg", "weight", "单重", "单件重量", "每件重量", "重量kg", "单重kg", "单件重量kg", "毛重kg", "净重kg"],
  totalWeightKg: ["totalWeight", "totalWeightKg", "grossWeight", "总重", "总重量", "总毛重", "毛重", "总净重", "总重量kg"],
  type: ["type", "cargoType", "rule", "货物类型", "类型", "规则", "摆放规则", "堆叠规则", "属性"],
  color: ["color", "颜色", "色值", "显示颜色"],
  id: ["id", "sku", "code", "货号", "编号", "物料编码", "产品编号", "条码"],
  remark: ["remark", "remarks", "note", "notes", "备注", "说明", "特殊要求", "装箱要求"],
  dimensionText: ["dimension", "dimensions", "size", "规格", "尺寸", "外尺寸", "长宽高", "尺寸cm", "尺寸mm", "规格尺寸"]
};

const TYPE_ALIASES = [
  { type: "nonstack", words: ["不可重压", "不能重压", "勿压", "易碎", "fragile", "nonstack", "non-stack", "no stack"] },
  { type: "pallet", words: ["托盘", "木箱", "栈板", "pallet", "wooden", "wood"] },
  { type: "upright", words: ["向上", "朝上", "不可倒置", "保持朝上", "upright", "this side up"] },
  { type: "normal", words: ["普通", "可堆叠", "normal", "standard"] }
];

export const importFields = STANDARD_FIELDS;

export function downloadTemplateWorkbook(rows) {
  const headers = ["name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color", "remark"];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "cargo-template");
  XLSX.writeFile(workbook, "cargo-import-template.xlsx");
}

export async function readWorkbook(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const sheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: "",
      blankrows: false
    });
    const { headerRowIndex, headers, bodyRows } = extractTable(rows);
    return {
      name,
      headerRowIndex,
      headers,
      rows: bodyRows,
      mapping: guessMapping(headers)
    };
  });
  return { fileName: file.name, sheets };
}

export function buildPreview(sheet, mapping, options = {}) {
  const dimensionUnit = options.dimensionUnit || "auto";
  const weightUnit = options.weightUnit || "auto";
  const validRows = [];
  const invalidRows = [];

  sheet.rows.forEach((cells, index) => {
    const raw = rowObject(sheet.headers, cells);
    const parsed = parseCargoRow(raw, mapping, {
      rowNumber: sheet.headerRowIndex + index + 2,
      dimensionUnit,
      weightUnit
    });
    if (parsed.errors.length) invalidRows.push(parsed);
    else validRows.push(parsed);
  });

  const aggregated = aggregateCargos(validRows.map((row) => row.cargo));
  return {
    totalRows: sheet.rows.length,
    validRows,
    invalidRows,
    aggregated,
    importedQuantity: aggregated.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0),
    skippedRows: invalidRows.length
  };
}

export function guessMapping(headers) {
  const normalized = headers.map((header) => normalizeHeader(header));
  const mapping = {};
  for (const field of STANDARD_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || [];
    const normalizedAliases = aliases.map(normalizeHeader);
    let matchIndex = normalized.findIndex((header) => normalizedAliases.includes(header));
    if (matchIndex < 0) {
      matchIndex = normalized.findIndex((header) =>
        normalizedAliases.some((alias) => alias && (header.includes(alias) || alias.includes(header)))
      );
    }
    mapping[field.key] = matchIndex >= 0 ? headers[matchIndex] : "";
  }
  if (!mapping.name && mapping.id) mapping.name = mapping.id;
  return mapping;
}

function extractTable(rows) {
  const headerRowIndex = findHeaderRow(rows);
  const headers = uniquifyHeaders((rows[headerRowIndex] || []).map(cleanCell));
  const bodyRows = rows
    .slice(headerRowIndex + 1)
    .map((row) => padRow(row, headers.length))
    .filter((row) => row.some((cell) => cleanCell(cell) !== ""));
  return { headerRowIndex, headers, bodyRows };
}

function findHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, index) => {
    const cells = row.map(cleanCell);
    const score = cells.reduce((sum, cell) => {
      const normalized = normalizeHeader(cell);
      const matched = Object.values(FIELD_ALIASES).some((aliases) =>
        aliases.map(normalizeHeader).some((alias) => alias && (normalized.includes(alias) || alias.includes(normalized)))
      );
      return sum + (matched ? 2 : cell ? 0.25 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function parseCargoRow(raw, mapping, context) {
  const notes = [];
  const errors = [];
  const dimensionText = valueFor(raw, mapping.dimensionText);
  const dimensions = parseDimensionText(dimensionText, context.dimensionUnit);
  const quantity = positiveInteger(valueFor(raw, mapping.quantity));
  const lengthCm = positiveNumber(valueFor(raw, mapping.lengthCm), unitFromHeader(mapping.lengthCm, context.dimensionUnit), dimensions?.[0]);
  const widthCm = positiveNumber(valueFor(raw, mapping.widthCm), unitFromHeader(mapping.widthCm, context.dimensionUnit), dimensions?.[1]);
  const heightCm = positiveNumber(valueFor(raw, mapping.heightCm), unitFromHeader(mapping.heightCm, context.dimensionUnit), dimensions?.[2]);
  const totalWeightKg = nonNegativeNumber(valueFor(raw, mapping.totalWeightKg), weightUnitFromHeader(mapping.totalWeightKg, context.weightUnit), null);
  const weightKg = nonNegativeNumber(
    valueFor(raw, mapping.weightKg),
    weightUnitFromHeader(mapping.weightKg, context.weightUnit),
    totalWeightKg != null && quantity ? totalWeightKg / quantity : null
  );
  const name = cleanCell(valueFor(raw, mapping.name) || valueFor(raw, mapping.id));
  const model = cleanCell(valueFor(raw, mapping.model));
  const remark = cleanCell(valueFor(raw, mapping.remark));
  const type = normalizeType(valueFor(raw, mapping.type), remark);
  const color = normalizeColor(valueFor(raw, mapping.color));
  const sku = cleanCell(valueFor(raw, mapping.id));

  if (!name) errors.push("缺少货物名称");
  if (!lengthCm) errors.push("长度必须大于 0");
  if (!widthCm) errors.push("宽度必须大于 0");
  if (!heightCm) errors.push("高度必须大于 0");
  if (!quantity) errors.push("数量必须是正整数");
  if (weightKg == null) errors.push("单件重量必须大于等于 0");
  if (dimensionText && !dimensions) notes.push("合并尺寸未识别，已尝试使用独立长宽高字段");
  if (totalWeightKg != null && !valueFor(raw, mapping.weightKg)) notes.push("已用总重量 / 数量换算单件重量");

  const cargo = parsedCargo({ name, model, lengthCm, widthCm, heightCm, quantity, weightKg, type, color, sku, remark });

  return {
    rowNumber: context.rowNumber,
    raw,
    cargo,
    errors,
    notes,
    suggestion: buildRowSuggestion(raw, cargo, errors, context.rowNumber)
  };
}

export function aggregateCargos(cargos) {
  const map = new Map();
  cargos.forEach((cargo) => {
    const key = [
      cargo.sku || cargo.name,
      cargo.name,
      cargo.model,
      cargo.lengthCm,
      cargo.widthCm,
      cargo.heightCm,
      cargo.weightKg,
      cargo.type,
      cargo.color
    ].join("|");
    const existing = map.get(key);
    if (existing) existing.quantity += cargo.quantity;
    else map.set(key, { ...cargo });
  });
  return assignCargoModels([...map.values()]);
}

export function assignCargoModels(cargos) {
  const byName = new Map();
  cargos.forEach((cargo) => {
    const name = cleanCell(cargo.name);
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(cargo);
  });

  return cargos.map((cargo) => {
    const siblings = byName.get(cleanCell(cargo.name)) || [];
    const dimensionKeys = new Set(siblings.map(dimensionKey));
    if (dimensionKeys.size <= 1 || cleanCell(cargo.model)) return { ...cargo };
    const orderedKeys = [...dimensionKeys].sort(compareDimensionKey);
    const modelIndex = Math.max(0, orderedKeys.indexOf(dimensionKey(cargo)));
    return { ...cargo, model: `型号 ${modelLabel(modelIndex)}` };
  });
}

export function validateCargo(cargo) {
  const errors = [];
  if (!cleanCell(cargo.name)) errors.push("缺少货物名称");
  if (!(Number(cargo.lengthCm) > 0)) errors.push("长度必须大于 0");
  if (!(Number(cargo.widthCm) > 0)) errors.push("宽度必须大于 0");
  if (!(Number(cargo.heightCm) > 0)) errors.push("高度必须大于 0");
  if (!(Number(cargo.quantity) > 0 && Number.isInteger(Number(cargo.quantity)))) errors.push("数量必须是正整数");
  if (!(Number(cargo.weightKg) >= 0)) errors.push("单件重量必须大于等于 0");
  return errors;
}

function buildRowSuggestion(raw, cargo, errors, rowNumber) {
  const fallbackDimensions = inferDimensionsFromRow(raw);
  const suggested = {
    name: cargo.name || inferNameFromRow(raw) || `第 ${rowNumber} 行货物`,
    model: cargo.model || "",
    lengthCm: cargo.lengthCm || fallbackDimensions?.[0] || "",
    widthCm: cargo.widthCm || fallbackDimensions?.[1] || "",
    heightCm: cargo.heightCm || fallbackDimensions?.[2] || "",
    quantity: cargo.quantity || 1,
    weightKg: cargo.weightKg || 0,
    type: cargo.type || normalizeType("", cargo.remark),
    color: cargo.color || "",
    sku: cargo.sku || "",
    remark: cargo.remark || ""
  };
  const notes = [];
  if (errors.some((error) => error.includes("名称"))) notes.push("名称缺失，已用原始行文本或行号生成临时名称");
  if (errors.some((error) => error.includes("数量"))) notes.push("数量缺失，建议先按 1 件导入，请确认");
  if (errors.some((error) => error.includes("重量"))) notes.push("重量缺失，建议先按 0 kg 导入，请确认");
  if (errors.some((error) => error.includes("长度") || error.includes("宽度") || error.includes("高度"))) {
    notes.push(fallbackDimensions ? "已从整行文本中重新识别长宽高" : "尺寸仍未识别，需要手动补充长宽高");
  }
  return {
    cargo: suggested,
    notes,
    errors: validateCargo(suggested)
  };
}

function inferDimensionsFromRow(raw) {
  for (const value of Object.values(raw)) {
    const dimensions = parseDimensionText(value, "auto");
    if (dimensions) return dimensions.map(round2);
  }
  const numbers = Object.values(raw)
    .map(numberFromCell)
    .filter((value) => value != null && value > 0);
  return numbers.length >= 3 ? numbers.slice(0, 3).map(round2) : null;
}

function inferNameFromRow(raw) {
  return Object.values(raw)
    .map(cleanCell)
    .find((value) => value && /[\u4e00-\u9fa5a-zA-Z]/.test(value) && !/^\d+(?:\.\d+)?$/.test(value));
}

function parsedCargo({
  name,
  model,
  lengthCm,
  widthCm,
  heightCm,
  quantity,
  weightKg,
  type,
  color,
  sku,
  remark
}) {
  return {
      name,
      model,
      lengthCm: round2(lengthCm),
      widthCm: round2(widthCm),
      heightCm: round2(heightCm),
      quantity,
      weightKg: round2(weightKg || 0),
      type,
      color,
      sku,
      remark
  };
}

function rowObject(headers, cells) {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
}

function valueFor(raw, header) {
  return header ? raw[header] : "";
}

function cleanCell(value) {
  if (value == null) return "";
  return String(value).replace(/\uFEFF/g, "").trim();
}

function normalizeHeader(value) {
  return cleanCell(value).toLowerCase().replace(/[\s_()（）\-:：/\\.【】\[\]]/g, "");
}

function uniquifyHeaders(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const fallback = header || `未命名列${index + 1}`;
    const count = seen.get(fallback) || 0;
    seen.set(fallback, count + 1);
    return count ? `${fallback}_${count + 1}` : fallback;
  });
}

function padRow(row, length) {
  return Array.from({ length }, (_, index) => cleanCell(row[index]));
}

function parseDimensionText(value, defaultUnit) {
  const text = cleanCell(value);
  if (!text) return null;
  const numbers = text.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (numbers.length < 3) return null;
  const unit = unitFromHeader(text, defaultUnit);
  return numbers.slice(0, 3).map((number) => convertDimension(number, unit));
}

function positiveNumber(value, unit, fallback) {
  const number = numberFromCell(value);
  if (number == null) return fallback ?? null;
  const converted = convertDimension(number, unit);
  return converted > 0 ? converted : null;
}

function nonNegativeNumber(value, unit, fallback) {
  const number = numberFromCell(value);
  if (number == null) return fallback ?? null;
  const converted = convertWeight(number, unit);
  return converted >= 0 ? converted : null;
}

function positiveInteger(value) {
  const number = numberFromCell(value);
  if (number == null) return null;
  const integer = Math.round(number);
  return integer > 0 ? integer : null;
}

function numberFromCell(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cleanCell(value).replace(/,/g, "");
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function unitFromHeader(header, selectedUnit) {
  if (selectedUnit && selectedUnit !== "auto") return selectedUnit;
  const text = cleanCell(header).toLowerCase();
  if (/mm|毫米/.test(text)) return "mm";
  if (/(^|[^c])m([^m]|$)|米/.test(text) && !/cm|厘米/.test(text)) return "m";
  return "cm";
}

function weightUnitFromHeader(header, selectedUnit) {
  if (selectedUnit && selectedUnit !== "auto") return selectedUnit;
  const text = cleanCell(header).toLowerCase();
  if (/吨|ton|t\b/.test(text)) return "t";
  if (/克|g\b/.test(text) && !/kg|公斤|千克/.test(text)) return "g";
  return "kg";
}

function convertDimension(value, unit) {
  if (unit === "mm") return value / 10;
  if (unit === "m") return value * 100;
  return value;
}

function convertWeight(value, unit) {
  if (unit === "g") return value / 1000;
  if (unit === "t") return value * 1000;
  return value;
}

function normalizeType(value, remark) {
  const text = `${cleanCell(value)} ${cleanCell(remark)}`.toLowerCase();
  for (const item of TYPE_ALIASES) {
    if (item.words.some((word) => text.includes(word.toLowerCase()))) return item.type;
  }
  return "normal";
}

function normalizeColor(value) {
  const text = cleanCell(value);
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  return "";
}

function dimensionKey(cargo) {
  return [
    round2(cargo.lengthCm),
    round2(cargo.widthCm),
    round2(cargo.heightCm),
    round2(cargo.weightKg),
    cargo.type || "normal"
  ].join("|");
}

function compareDimensionKey(a, b) {
  const aParts = a.split("|");
  const bParts = b.split("|");
  for (let i = 0; i < 4; i += 1) {
    const diff = Number(aParts[i] || 0) - Number(bParts[i] || 0);
    if (diff) return diff;
  }
  return String(aParts[4] || "").localeCompare(String(bParts[4] || ""));
}

function modelLabel(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length) + 1}`;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
