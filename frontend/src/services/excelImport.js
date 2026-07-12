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
  quantity: ["quantity", "qty", "count", "num", "pcs", "palletqty", "pallets", "skids", "数量", "件数", "箱数", "个数", "数量pcs", "总件数", "托盘数", "托数", "栈板数"],
  weightKg: ["weightKg", "unitWeight", "unitWeightKg", "weight", "单重", "单件重量", "每件重量", "重量kg", "单重kg", "单件重量kg", "毛重kg", "净重kg"],
  totalWeightKg: ["totalWeight", "totalWeightKg", "grossWeight", "总重", "总重量", "总毛重", "毛重", "总净重", "总重量kg"],
  type: ["type", "cargoType", "rule", "货物类型", "类型", "规则", "摆放规则", "堆叠规则", "属性"],
  color: ["color", "颜色", "色值", "显示颜色"],
  id: ["id", "sku", "code", "cargoId", "goodsId", "productId", "货物ID", "货物编号", "货号", "编号", "物料编码", "产品编号", "条码"],
  remark: ["remark", "remarks", "note", "notes", "备注", "说明", "特殊要求", "装箱要求"],
  dimensionText: ["dimension", "dimensions", "size", "palletsize", "skidsize", "packagesize", "规格", "尺寸", "外尺寸", "长宽高", "尺寸cm", "尺寸mm", "规格尺寸", "托盘尺寸", "托盘尺寸cm", "栈板尺寸", "包装尺寸"]
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
    const worksheet = workbook.Sheets[name];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: true
    });
    const { headerRowIndex, headers, bodyRows } = extractTable(rawRows);
    return {
      name,
      headerRowIndex,
      headers,
      rows: bodyRows,
      mapping: guessMapping(headers),
      rawRows: rawRows.map((row) => row.map(cleanCell)),
      merges: formatMergeRanges(worksheet?.["!merges"] || [])
    };
  });
  return { fileName: file.name, sheets };
}

export function formatWorkbookForRecognition(workbook, options = {}) {
  const maxRows = Math.max(20, Number(options.maxRows || 240));
  const maxColumns = Math.max(12, Number(options.maxColumns || 80));
  const maxMergeRanges = Math.max(20, Number(options.maxMergeRanges || 200));
  const maxCellChars = Math.max(200, Number(options.maxCellChars || 1_000));
  const lines = [
    "EXCEL_FORMATTED_TABLE_FOR_AGENT",
    `FILE: ${cleanCell(workbook?.fileName || options.fileName || "")}`,
    "TASK: Extract final handled shipping units for container packing. Prefer final pallet/carton/crate package units over loose product rows.",
    "HIERARCHY_RULE: Infer product -> carton -> pallet/crate relationships semantically from any headers, values, sheet/file names, notes, merged cells, and neighboring rows; customer header names are not fixed.",
    "PALLET_RULE: When the source describes loaded pallets, algorithm quantity means pallet count. Carton count, carton dimensions, cartons per pallet, layers, and cartons per layer are innerCargo only.",
    "PALLET_DIMENSION_RULE: Use pallet L/W/H only when the loaded-pallet outer dimensions are explicitly present. If absent, never substitute carton dimensions or infer dimensions from volume/layers; return a pallet candidate with zero dimensions and mark palletDimensionsMissing for user input.",
    "WEIGHT_RULE: If a final pallet/wooden package has pallet tare/wood-package weight and contains product rows, calculate unit weight as (pallet tare total + contained product gross total) / pallet quantity. If a final gross-weight column clearly already includes pallet plus cargo, do not double count; explain the basis in remark/packageInfo.",
    "STRUCTURE_RULE: In sheets with left product/carton details and right pallet/final-package columns, output the right-side final pallet/package rows as algorithm cargo. Store left-side loose/carton details only in packageInfo.innerCargo or remark."
  ];
  let emittedWorkbookRows = 0;

  (workbook?.sheets || []).forEach((sheet, sheetIndex) => {
    lines.push("");
    lines.push(`SHEET ${sheetIndex + 1}: ${cleanCell(sheet.name) || "Sheet" + (sheetIndex + 1)}`);
    lines.push(`DETECTED_HEADER_ROW: ${Number(sheet.headerRowIndex || 0) + 1}`);
    if (Array.isArray(sheet.merges) && sheet.merges.length) {
      lines.push(`MERGED_RANGES: ${sheet.merges.slice(0, maxMergeRanges).join(", ")}`);
      if (sheet.merges.length > maxMergeRanges) {
        lines.push(`MERGED_RANGES_TRUNCATED: emitted ${maxMergeRanges} of ${sheet.merges.length}.`);
      }
    }
    lines.push("ROWS_WITH_EXCEL_COORDINATES:");
    const rows = Array.isArray(sheet.rawRows) && sheet.rawRows.length
      ? sheet.rawRows
      : [[...(sheet.headers || [])], ...(sheet.rows || [])];
    let emitted = 0;
    let truncatedCellCount = 0;
    let truncatedColumnRowCount = 0;
    rows.forEach((row, rowIndex) => {
      if (emittedWorkbookRows >= maxRows) return;
      if ((row || []).slice(maxColumns).some((value) => cleanCell(value) !== "")) {
        truncatedColumnRowCount += 1;
      }
      const cells = (row || [])
        .slice(0, maxColumns)
        .map((value, columnIndex) => {
          const cleaned = cleanCell(value);
          if (cleaned.length > maxCellChars) truncatedCellCount += 1;
          return { value: cleaned, columnIndex };
        })
        .filter((cell) => cell.value !== "");
      if (!cells.length) return;
      emitted += 1;
      emittedWorkbookRows += 1;
      lines.push(`R${rowIndex + 1}: ${cells.map((cell) => `${columnName(cell.columnIndex)}=${quoteForRecognition(cell.value, maxCellChars)}`).join(" | ")}`);
    });
    const nonEmptyRows = rows.filter((row) => (row || []).some((cell) => cleanCell(cell) !== "")).length;
    if (nonEmptyRows > emitted) {
      lines.push(`TRUNCATED: emitted ${emitted} non-empty rows of ${nonEmptyRows}.`);
    }
    if (truncatedColumnRowCount > 0) {
      lines.push(`COLUMNS_TRUNCATED: ${truncatedColumnRowCount} emitted row(s) contained non-empty cells after column ${columnName(maxColumns - 1)}.`);
    }
    if (truncatedCellCount > 0) {
      lines.push(`CELL_VALUES_TRUNCATED: shortened ${truncatedCellCount} cell value(s) longer than ${maxCellChars} characters.`);
    }
  });

  return lines.join("\n");
}

export function buildPreview(sheet, mapping, options = {}) {
  const dimensionUnit = options.dimensionUnit || "auto";
  const weightUnit = options.weightUnit || "auto";
  const validRows = [];
  const invalidRows = [];
  let parsedRowCount = 0;

  sheet.rows.forEach((cells, index) => {
    const raw = rowObject(sheet.headers, cells);
    if (shouldSkipDataRow(raw, mapping, cells)) return;
    parsedRowCount += 1;
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
    totalRows: parsedRowCount,
    validRows,
    invalidRows,
    aggregated,
    importedQuantity: aggregated.reduce((sum, cargo) => sum + Number(cargo.quantity || 0), 0),
    skippedRows: invalidRows.length
  };
}

export function parseCargoText(text, options = {}) {
  const lines = splitCargoText(text);
  const validRows = [];
  const invalidRows = [];

  lines.forEach((line, index) => {
    const parsed = parseCargoTextLine(line, index + 1, options);
    if (parsed.errors.length) invalidRows.push(parsed);
    else validRows.push(parsed);
  });

  const aggregated = aggregateCargos(validRows.map((row) => row.cargo));
  return {
    totalRows: lines.length,
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
        normalizedAliases.some((alias) => alias && canFuzzyMatchAlias(alias) && header.includes(alias))
      );
    }
    mapping[field.key] = matchIndex >= 0 ? headers[matchIndex] : "";
  }
  if (!mapping.name && mapping.id) mapping.name = mapping.id;
  return refineMapping(headers, mapping);
}

function refineMapping(headers, mapping) {
  const refined = { ...mapping };
  applyPackingListMapping(headers, refined);
  return refined;
}

function applyPackingListMapping(headers, mapping) {
  const productHeaders = headers.slice(0, firstPalletColumnIndex(headers));
  const nameHeader = firstHeader(productHeaders, isCargoNameHeader);
  const outerDimensionHeader = firstHeader(productHeaders, isOuterCartonDimensionHeader);
  const packageCountHeader = firstHeader(productHeaders, isPackageCountHeader);
  const packingQuantityHeader = firstHeader(productHeaders, isPackingQuantityHeader);
  const sourceQuantityHeader = firstHeader(productHeaders, isSourceQuantityHeader);
  const unitGrossWeightHeader = firstHeader(productHeaders, isUnitGrossWeightHeader);
  const totalWeightHeader = firstHeader(productHeaders, isTotalWeightHeader);
  const remarkHeader = firstHeader(productHeaders, isRemarkHeader);

  const looksLikePackingList = nameHeader
    && outerDimensionHeader
    && (packageCountHeader || packingQuantityHeader || unitGrossWeightHeader || totalWeightHeader);
  if (!looksLikePackingList) return;

  mapping.__packingList = "true";
  mapping.__packageUnit = "carton";
  mapping.name = nameHeader;
  mapping.dimensionText = outerDimensionHeader;
  mapping.lengthCm = "";
  mapping.widthCm = "";
  mapping.heightCm = "";
  if (packageCountHeader) mapping.quantity = packageCountHeader;
  else if (sourceQuantityHeader && packingQuantityHeader) mapping.quantity = "";
  if (unitGrossWeightHeader) mapping.weightKg = unitGrossWeightHeader;
  else if (totalWeightHeader) mapping.weightKg = "";
  if (totalWeightHeader) mapping.totalWeightKg = totalWeightHeader;
  if (remarkHeader) mapping.remark = remarkHeader;
  if (sourceQuantityHeader) mapping.__sourceQuantity = sourceQuantityHeader;
  if (packingQuantityHeader) mapping.__packingQuantity = packingQuantityHeader;
}

function firstPalletColumnIndex(headers) {
  const index = headers.findIndex(isPalletHeader);
  return index < 0 ? headers.length : index;
}

function firstHeader(headers, predicate) {
  return headers.find((header) => predicate(normalizeHeader(header))) || "";
}

function isCargoNameHeader(header) {
  return [
    "\u54c1\u540d",
    "\u4ea7\u54c1\u540d\u79f0",
    "\u8d27\u7269\u540d\u79f0",
    "\u8d27\u540d",
    "\u540d\u79f0",
    "size",
    "name",
    "goodsname",
    "productname"
  ].includes(header);
}

function isOuterCartonDimensionHeader(header) {
  return header.includes("\u5916\u7bb1\u5c3a\u5bf8")
    || header.includes("\u5916\u7bb1\u89c4\u683c")
    || header.includes("\u7eb8\u7bb1\u5c3a\u5bf8")
    || header.includes("\u5305\u88c5\u5c3a\u5bf8")
    || header === "\u7bb1\u89c4"
    || header === "\u7bb1\u5c3a\u5bf8"
    || header.includes("cartonsize")
    || header.includes("outersize")
    || header.includes("outercarton");
}

function isPackageCountHeader(header) {
  return [
    "\u4ef6\u6570",
    "\u7bb1\u6570",
    "\u603b\u4ef6\u6570",
    "\u603b\u7bb1\u6570",
    "ctn",
    "ctns",
    "tctn",
    "tctns",
    "totalctn",
    "totalctns",
    "totalcarton",
    "totalcartons",
    "carton",
    "cartons",
    "boxes"
  ].includes(header) && !header.includes("\u88c5\u7bb1");
}

function isPackingQuantityHeader(header) {
  return header.includes("\u88c5\u7bb1\u6570\u91cf")
    || header.includes("\u6bcf\u7bb1\u6570\u91cf")
    || header.includes("\u5165\u6570")
    || header.includes("pcsctn")
    || header.includes("qtyctn");
}

function isSourceQuantityHeader(header) {
  return [
    "\u6570\u91cf",
    "\u4ea7\u54c1\u6570\u91cf",
    "\u603b\u6570\u91cf",
    "qty",
    "quantity",
    "orderqty",
    "orderquantity",
    "pcs"
  ].includes(header);
}

function isUnitGrossWeightHeader(header) {
  return [
    "\u6bdb\u91cd",
    "\u6bdb\u91cdkg",
    "\u5355\u7bb1\u6bdb\u91cd",
    "\u5355\u7bb1\u6bdb\u91cdkg",
    "\u6bcf\u7bb1\u6bdb\u91cd",
    "\u7bb1\u6bdb\u91cd",
    "\u7bb1\u91cd",
    "gw",
    "gwkg",
    "gwkgs",
    "gweight",
    "gweightkg",
    "gweightkgs",
    "grossweight"
  ].includes(header) && !header.includes("\u603b") && !isPalletHeader(header);
}

function isTotalWeightHeader(header) {
  return (header.includes("\u603b\u91cd\u91cf")
    || header.includes("\u603b\u91cd")
    || header.includes("\u603b\u6bdb\u91cd")
    || header.includes("\u91cd\u91cf\u5408\u8ba1")
    || header.includes("\u5408\u8ba1\u91cd\u91cf")
    || header.includes("totalweight")
    || header.includes("tgw")
    || header.includes("tgwkg")
    || header.includes("tgwkgs")
    || header.includes("totalgw")
    || header.includes("grossweighttotal"))
    && !header.includes("\u4f53\u79ef")
    && !isPalletHeader(header);
}

function isRemarkHeader(header) {
  return ["\u5907\u6ce8", "remark", "remarks", "note"].includes(header);
}

function isPalletHeader(header) {
  const normalized = normalizeHeader(header);
  return normalized.includes("\u6258\u76d8")
    || normalized.includes("\u6808\u677f")
    || normalized.includes("\u514d\u718f\u84b8")
    || normalized.includes("pallet");
}

function parseCargoTextLine(line, rowNumber, options = {}) {
  const rawText = cleanCell(line);
  const text = normalizeTextSymbols(rawText);
  const dimension = extractTextDimensions(text, options.dimensionUnit || "auto");
  const quantity = extractTextQuantity(text);
  const weight = extractTextWeight(text, quantity.value, options.weightUnit || "auto");
  const explicitModel = extractTextModel(text);
  const nameModel = extractTextNameModel(text, [dimension, quantity, weight, explicitModel].filter(Boolean));
  const type = normalizeType(text, text);
  const notes = [];

  if (dimension) notes.push(`识别尺寸：${dimension.values.join(" × ")} cm`);
  if (quantity.raw) notes.push(`识别数量：${quantity.value} 件`);
  if (weight.fromTotal) notes.push("已用总重量 / 数量换算单件重量");
  if (!weight.raws.length) notes.push("未识别单件重量，暂按 0 kg 导入，请确认重心计算是否需要补重");
  if (nameModel.model && !explicitModel) notes.push(`从名称尾部识别型号：${nameModel.model}`);
  if (type !== "normal") notes.push(`识别堆叠规则：${type}`);

  const cargo = parsedCargo({
    name: nameModel.name,
    model: explicitModel?.value || nameModel.model || "",
    lengthCm: dimension?.values[0] || 0,
    widthCm: dimension?.values[1] || 0,
    heightCm: dimension?.values[2] || 0,
    quantity: quantity.value || 0,
    weightKg: weight.value ?? 0,
    type,
    color: "",
    sku: "",
    remark: notes.join("；")
  });
  const errors = validateCargo(cargo).filter((error) => !error.includes("重量"));
  const confidence = textConfidence({ name: cargo.name, dimension, quantity, weight, errors });

  return {
    rowNumber,
    raw: { text: rawText },
    text: rawText,
    cargo,
    confidence,
    errors,
    notes,
    suggestion: buildTextSuggestion(rawText, cargo, errors, rowNumber)
  };
}

function splitCargoText(text) {
  return cleanCell(text)
    .replace(/\r/g, "\n")
    .split(/\n|；|;/)
    .map((line) => cleanCell(line))
    .filter(Boolean);
}

function normalizeTextSymbols(value) {
  return cleanCell(value)
    .replace(/[＊Ｘｘ]/g, "*")
    .replace(/[×X]/g, "*")
    .replace(/[，、。]/g, " ")
    .replace(/\s+/g, " ");
}

function extractTextDimensions(text, defaultUnit) {
  const number = "(\\d+(?:\\.\\d+)?)";
  const unit = "(mm|毫米|cm|厘米|m|米)?";
  const sizePattern = new RegExp(`${number}\\s*${unit}\\s*[*]\\s*${number}\\s*${unit}\\s*[*]\\s*${number}\\s*${unit}`, "i");
  const sizeMatch = text.match(sizePattern);
  if (sizeMatch) {
    const units = [sizeMatch[2], sizeMatch[4], sizeMatch[6]].filter(Boolean);
    const finalUnit = normalizeDimensionUnit(units[units.length - 1] || defaultUnit || "cm");
    return {
      raw: sizeMatch[0],
      index: sizeMatch.index ?? -1,
      values: [sizeMatch[1], sizeMatch[3], sizeMatch[5]].map((value) => round2(convertDimension(Number(value), finalUnit)))
    };
  }

  const namedPattern = new RegExp(`长(?:度)?\\s*[:：]?\\s*${number}\\s*${unit}\\s*宽(?:度)?\\s*[:：]?\\s*${number}\\s*${unit}\\s*高(?:度)?\\s*[:：]?\\s*${number}\\s*${unit}`, "i");
  const namedMatch = text.match(namedPattern);
  if (namedMatch) {
    const units = [namedMatch[2], namedMatch[4], namedMatch[6]].filter(Boolean);
    const finalUnit = normalizeDimensionUnit(units[units.length - 1] || defaultUnit || "cm");
    return {
      raw: namedMatch[0],
      index: namedMatch.index ?? -1,
      values: [namedMatch[1], namedMatch[3], namedMatch[5]].map((value) => round2(convertDimension(Number(value), finalUnit)))
    };
  }
  return null;
}

function extractTextQuantity(text) {
  const labeled = text.match(/(?:数量|件数|箱数|个数|qty|pcs)\s*[:：]?\s*(\d+)\s*(?:件|箱|个|pcs)?/i);
  const loose = text.match(/(\d+)\s*(?:件|箱|个|pcs)/i);
  const match = labeled || loose;
  return {
    raw: match?.[0] || "",
    index: match?.index ?? -1,
    value: match ? Math.max(1, Math.round(Number(match[1]))) : 1
  };
}

function extractTextWeight(text, quantity, defaultUnit) {
  const total = text.match(/(?:总重|总重量|总毛重|总净重|毛重合计|重量合计|合计重量)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|公斤|千克|g|克|t|吨)/i);
  if (total) {
    const totalKg = convertWeight(Number(total[1]), normalizeWeightUnit(total[2] || defaultUnit || "kg"));
    return {
      raws: [total[0]],
      index: total.index ?? -1,
      value: quantity ? round2(totalKg / quantity) : round2(totalKg),
      fromTotal: Boolean(quantity)
    };
  }

  const labeled = text.match(/(?:单重|单件重量|每件重量|每件|重量|净重|毛重|重)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|公斤|千克|g|克|t|吨)(?:\s*(?:\/|／)\s*(?:件|箱|pcs))?/i);
  const perPiece = text.match(/(\d+(?:\.\d+)?)\s*(kg|公斤|千克|g|克|t|吨)\s*(?:\/|／)?\s*(?:件|箱|pcs|每件)/i);
  const match = labeled || perPiece;
  if (!match) return { raws: [], index: -1, value: 0, fromTotal: false };
  return {
    raws: [match[0]],
    index: match.index ?? -1,
    value: round2(convertWeight(Number(match[1]), normalizeWeightUnit(match[2] || defaultUnit || "kg"))),
    fromTotal: false
  };
}

function extractTextModel(text) {
  const match = text.match(/(?:型号|规格|model)\s*[:：]?\s*([A-Za-z0-9#\-_/.一二三四五六七八九十]+)\b/i);
  if (!match || /[*]/.test(match[1])) return null;
  return { raw: match[0], index: match.index ?? -1, value: cleanCell(match[1]) };
}

function extractTextNameModel(text, parts) {
  const indexes = parts.map((part) => part.index).filter((index) => index >= 0);
  const firstIndex = indexes.length ? Math.min(...indexes) : -1;
  let name = firstIndex > 0 ? text.slice(0, firstIndex) : text;
  parts.forEach((part) => {
    if (part.raw) name = name.replace(part.raw, " ");
    if (Array.isArray(part.raws)) {
      part.raws.forEach((raw) => {
        name = name.replace(raw, " ");
      });
    }
  });
  name = name
    .replace(/(?:名称|品名|货物|货名|产品)\s*[:：]/g, " ")
    .replace(/\b(?:cm|mm|kg|pcs|model)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const inferred = name.match(/^(.+?)[\s\-_/]*(\d{2,6}[A-Za-z]?|[A-Za-z]\d{1,4}|#\d{1,6})$/);
  if (inferred && /[\u4e00-\u9fa5A-Za-z]/.test(inferred[1])) {
    return { name: cleanCell(inferred[1]), model: cleanCell(inferred[2].replace(/^#/, "")) };
  }
  return { name, model: "" };
}

function buildTextSuggestion(line, cargo, errors, rowNumber) {
  const fallbackDimensions = parseDimensionText(line, "auto");
  const suggested = {
    name: cargo.name || inferNameFromRow({ text: line }) || `文本第 ${rowNumber} 行货物`,
    model: cargo.model || "",
    lengthCm: cargo.lengthCm || fallbackDimensions?.[0] || "",
    widthCm: cargo.widthCm || fallbackDimensions?.[1] || "",
    heightCm: cargo.heightCm || fallbackDimensions?.[2] || "",
    quantity: cargo.quantity || 1,
    weightKg: cargo.weightKg || 0,
    type: cargo.type || normalizeType("", line),
    color: "",
    sku: "",
    remark: cargo.remark || ""
  };
  const notes = [];
  if (errors.some((error) => error.includes("名称"))) notes.push("名称未识别，建议从原始文本中截取货物名");
  if (errors.some((error) => error.includes("长度") || error.includes("宽度") || error.includes("高度"))) notes.push("尺寸未识别，建议补充长宽高");
  if (errors.some((error) => error.includes("数量"))) notes.push("数量未识别，建议确认件数");
  return {
    cargo: suggested,
    notes,
    errors: validateCargo(suggested).filter((error) => !error.includes("重量"))
  };
}

function textConfidence({ name, dimension, quantity, weight, errors }) {
  let score = 0;
  if (name) score += 0.25;
  if (dimension) score += 0.35;
  if (quantity.raw) score += 0.2;
  else score += 0.12;
  if (weight.raws.length) score += 0.2;
  else score += 0.08;
  score -= errors.length * 0.18;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
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
  let quantity = positiveInteger(valueFor(raw, mapping.quantity));
  if (!quantity && isPackingListMapping(mapping)) {
    quantity = inferPackageQuantity(
      valueFor(raw, mapping.__sourceQuantity),
      valueFor(raw, mapping.__packingQuantity)
    );
    if (quantity) notes.push("\u5df2\u7528\u4ea7\u54c1\u6570\u91cf / \u88c5\u7bb1\u6570\u91cf\u6362\u7b97\u8fd0\u8f93\u4ef6\u6570");
  }
  const lengthCm = positiveNumber(valueFor(raw, mapping.lengthCm), unitFromHeader(mapping.lengthCm, context.dimensionUnit), dimensions?.[0]);
  const widthCm = positiveNumber(valueFor(raw, mapping.widthCm), unitFromHeader(mapping.widthCm, context.dimensionUnit), dimensions?.[1]);
  const heightCm = positiveNumber(valueFor(raw, mapping.heightCm), unitFromHeader(mapping.heightCm, context.dimensionUnit), dimensions?.[2]);
  const totalWeightKg = nonNegativeNumber(valueFor(raw, mapping.totalWeightKg), weightUnitFromHeader(mapping.totalWeightKg, context.weightUnit), null);
  const weightSource = mapping.weightKg && mapping.weightKg !== mapping.totalWeightKg ? valueFor(raw, mapping.weightKg) : "";
  const weightKg = nonNegativeNumber(
    weightSource,
    weightUnitFromHeader(mapping.weightKg, context.weightUnit),
    totalWeightKg != null && quantity ? totalWeightKg / quantity : null
  );
  const name = cleanCell(valueFor(raw, mapping.name) || valueFor(raw, mapping.id));
  const model = cleanCell(valueFor(raw, mapping.model));
  const remark = cleanCell(valueFor(raw, mapping.remark));
  let type = normalizeType(valueFor(raw, mapping.type), remark);
  if (type === "normal" && packageUnitFromMapping(mapping) === "pallet") type = "pallet";
  const color = normalizeColor(valueFor(raw, mapping.color));
  const sku = cleanCell(valueFor(raw, mapping.id));

  if (!name) errors.push("缺少货物名称");
  if (!lengthCm) errors.push("长度必须大于 0");
  if (!widthCm) errors.push("宽度必须大于 0");
  if (!heightCm) errors.push("高度必须大于 0");
  if (!quantity) errors.push("数量必须是正整数");
  if (weightKg == null) errors.push("单件重量必须大于等于 0");
  if (dimensionText && !dimensions) notes.push("合并尺寸未识别，已尝试使用独立长宽高字段");
  if (totalWeightKg != null && !weightSource) notes.push("已用总重量 / 数量换算单件重量");

  const packageInfo = buildPackageInfo({
    mapping,
    raw,
    quantity,
    lengthCm,
    widthCm,
    heightCm,
    weightKg,
    totalWeightKg
  });
  if (packageInfo && isPackingListMapping(mapping)) {
    notes.push("导入口径：算法货物=外包装箱/托盘，散件数量仅保存为包装明细");
  }

  const cargo = parsedCargo({ name, model, lengthCm, widthCm, heightCm, quantity, weightKg, type, color, sku, remark, packageInfo });

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
    if (existing) {
      existing.quantity += cargo.quantity;
      existing.packageInfo = mergePackageInfo(existing.packageInfo, cargo.packageInfo, existing.quantity);
    } else {
      map.set(key, { ...cargo });
    }
  });
  return assignCargoModels([...map.values()]);
}

function mergePackageInfo(left, right, packageQuantity) {
  if (!left && !right) return undefined;
  const base = { ...(right || {}), ...(left || {}) };
  base.packageQuantity = packageQuantity;
  const leftInner = left?.innerCargo || {};
  const rightInner = right?.innerCargo || {};
  const innerCargo = { ...rightInner, ...leftInner };

  ["cartonCount", "totalCartons", "totalQuantity"].forEach((field) => {
    const total = sumNumericField(leftInner, rightInner, field);
    if (total != null) innerCargo[field] = Math.round(total);
  });
  ["cartonTotalGrossWeightKg", "totalGrossWeightKg", "totalWeightKg", "cargoTotalWeightKg"].forEach((field) => {
    const total = sumNumericField(leftInner, rightInner, field);
    if (total != null) innerCargo[field] = round2(total);
  });

  if (Object.keys(innerCargo).length) base.innerCargo = compactObject(innerCargo);
  [
    "packageTotalGrossWeightKg",
    "palletTotalGrossWeightKg",
    "handlingUnitTotalGrossWeightKg",
    "cargoTotalWeightKg",
    "containedCargoTotalGrossWeightKg",
    "totalGrossWeightKg",
    "totalWeightKg"
  ].forEach((field) => {
    const total = sumNumericField(left || {}, right || {}, field);
    if (total != null) base[field] = round2(total);
  });
  return compactObject(base);
}

function sumNumericField(left, right, field) {
  const leftValue = Number(left?.[field]);
  const rightValue = Number(right?.[field]);
  const hasLeft = Number.isFinite(leftValue) && left?.[field] !== "" && left?.[field] != null;
  const hasRight = Number.isFinite(rightValue) && right?.[field] !== "" && right?.[field] != null;
  if (!hasLeft && !hasRight) return null;
  return (hasLeft ? leftValue : 0) + (hasRight ? rightValue : 0);
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
  remark,
  packageInfo
}) {
  const cargo = {
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
  if (packageInfo) cargo.packageInfo = packageInfo;
  return cargo;
}

function rowObject(headers, cells) {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
}

function valueFor(raw, header) {
  return header ? raw[header] : "";
}

function formatMergeRanges(merges) {
  return merges
    .map((range) => {
      const start = `${columnName(range.s.c)}${range.s.r + 1}`;
      const end = `${columnName(range.e.c)}${range.e.r + 1}`;
      return start === end ? start : `${start}:${end}`;
    })
    .filter(Boolean);
}

function columnName(index) {
  let value = Number(index || 0) + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name || "A";
}

function quoteForRecognition(value, maxChars = 1_000) {
  const text = cleanCell(value);
  if (text.length <= maxChars) return JSON.stringify(text);
  const marker = " …[cell truncated]… ";
  const availableChars = Math.max(2, maxChars - marker.length);
  const headLength = Math.max(1, Math.floor(availableChars * 0.75));
  const tailLength = Math.max(1, availableChars - headLength);
  return JSON.stringify(`${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`);
}

function cleanCell(value) {
  if (value == null) return "";
  return String(value).replace(/\uFEFF/g, "").trim();
}

function normalizeHeader(value) {
  return cleanCell(value).toLowerCase().replace(/[\s_()（）\-:：/\\.【】\[\]]/g, "");
}

function canFuzzyMatchAlias(alias) {
  return alias.length > 2 || /[\u4e00-\u9fa5]/.test(alias);
}

function isPackingListMapping(mapping) {
  return mapping?.__packingList === "true";
}

function inferPackageQuantity(sourceQuantity, packingQuantity) {
  const total = numberFromCell(sourceQuantity);
  const perPackage = numberFromCell(packingQuantity);
  if (!(total > 0) || !(perPackage > 0)) return null;
  return Math.max(1, Math.ceil(total / perPackage));
}

function buildPackageInfo({
  mapping,
  raw,
  quantity,
  lengthCm,
  widthCm,
  heightCm,
  weightKg,
  totalWeightKg
}) {
  const packageQuantity = Math.max(0, Math.round(Number(quantity || 0)));
  const packageGrossWeightKg = round2(weightKg || 0);
  const innerTotalQuantity = numberFromCell(valueFor(raw, mapping.__sourceQuantity));
  const innerPiecesPerPackage = numberFromCell(valueFor(raw, mapping.__packingQuantity));
  const hasPackageSignal = isPackingListMapping(mapping)
    || normalizeHeader(mapping.dimensionText).includes("pallet")
    || normalizeHeader(mapping.dimensionText).includes("skid")
    || normalizeHeader(mapping.dimensionText).includes("\u6258\u76d8")
    || normalizeHeader(mapping.dimensionText).includes("\u6808\u677f");
  const hasInnerInfo = innerTotalQuantity > 0 || innerPiecesPerPackage > 0;
  if (!hasPackageSignal && !hasInnerInfo) return null;

  const unit = packageUnitFromMapping(mapping);
  const packageTotalGrossWeightKg = totalWeightKg != null
    ? round2(totalWeightKg)
    : round2(packageGrossWeightKg * packageQuantity);
  return compactObject({
    algorithmBasis: "package-unit",
    packageUnit: unit,
    packageQuantity,
    packageDimensionsCm: compactObject({
      lengthCm: round2(lengthCm || 0),
      widthCm: round2(widthCm || 0),
      heightCm: round2(heightCm || 0)
    }),
    packageGrossWeightKg,
    packageTotalGrossWeightKg,
    innerCargo: compactObject({
      totalQuantity: innerTotalQuantity > 0 ? Math.round(innerTotalQuantity) : null,
      piecesPerPackage: innerPiecesPerPackage > 0 ? innerPiecesPerPackage : null,
      quantityUnit: hasInnerInfo ? "pcs" : null
    })
  });
}

function packageUnitFromMapping(mapping = {}) {
  const text = `${mapping.__packageUnit || ""} ${mapping.dimensionText || ""}`.toLowerCase();
  const normalized = normalizeHeader(text);
  if (normalized.includes("pallet") || normalized.includes("skid") || normalized.includes("\u6258\u76d8") || normalized.includes("\u6808\u677f")) return "pallet";
  if (normalized.includes("crate") || normalized.includes("wood") || normalized.includes("\u6728\u7bb1")) return "crate";
  return "carton";
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (value == null || value === "") return false;
    if (typeof value === "number" && !Number.isFinite(value)) return false;
    if (value && typeof value === "object" && !Array.isArray(value)) return Object.keys(value).length > 0;
    return true;
  }));
}

function shouldSkipDataRow(raw, mapping, cells) {
  const name = cleanCell(valueFor(raw, mapping.name));
  if (isSummaryText(name)) return true;
  if (isPackingListMapping(mapping) && !name) return true;
  return !name && cells.map(normalizeHeader).some(isSummaryText);
}

function isSummaryText(value) {
  return ["\u5408\u8ba1", "\u5c0f\u8ba1", "\u603b\u8ba1", "total", "subtotal"].includes(normalizeHeader(value));
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

function normalizeDimensionUnit(unit) {
  const text = cleanCell(unit).toLowerCase();
  if (/mm|毫米/.test(text)) return "mm";
  if (/^m$|米/.test(text)) return "m";
  return "cm";
}

function weightUnitFromHeader(header, selectedUnit) {
  if (selectedUnit && selectedUnit !== "auto") return selectedUnit;
  const text = cleanCell(header).toLowerCase();
  if (/kg|kgs|公斤|千克/.test(text)) return "kg";
  if (/吨|ton|t\b/.test(text)) return "t";
  if (/克|g\b/.test(text) && !/kg|公斤|千克/.test(text)) return "g";
  return "kg";
}

function normalizeWeightUnit(unit) {
  const text = cleanCell(unit).toLowerCase();
  if (/吨|ton|^t$/.test(text)) return "t";
  if (/克|^g$/.test(text) && !/kg|公斤|千克/.test(text)) return "g";
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
