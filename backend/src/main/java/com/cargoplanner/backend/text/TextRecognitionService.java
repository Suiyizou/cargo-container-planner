package com.cargoplanner.backend.text;

import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TextRecognitionService {
  private static final List<String> OUTPUT_HEADERS = List.of(
      "name", "model", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color", "sku", "remark"
  );
  private static final Pattern SKID_LINE_PATTERN = Pattern.compile(
      "(?i)^\\s*(?:(?<name>[\\p{IsHan}A-Za-z][^\\d/]{1,80}?)\\s+)?(?<quantity>\\d+)\\s*"
          + "(?<pack>skids?|pallets?|pieces?|pcs|cartons?|cases?|boxes?|crates?|件|箱|个|托|托盘)"
          + "\\s*[-–—]?\\s*(?:each\\s*)?(?<weight>[0-9][0-9.,]*)\\s*(?:kgs?|kg|公斤|千克)"
          + "\\s*/\\s*(?<length>[0-9][0-9.,]*)\\s*[x×*]\\s*(?<width>[0-9][0-9.,]*)"
          + "\\s*[x×*]\\s*(?<height>[0-9][0-9.,]*)\\s*(?<dimensionUnit>cm|mm|m|厘米|毫米|米)?\\s*$"
  );
  private static final Pattern DIMENSION_LINE_PATTERN = Pattern.compile(
      "(?i)^\\s*(?<name>.*?)\\s*(?<length>[0-9][0-9.,]*)\\s*[x×*]\\s*(?<width>[0-9][0-9.,]*)"
          + "\\s*[x×*]\\s*(?<height>[0-9][0-9.,]*)\\s*(?<dimensionUnit>cm|mm|m|厘米|毫米|米)?\\s*(?<tail>.*)$"
  );
  private static final Pattern QUANTITY_PATTERN = Pattern.compile("(?i)(?:数量|qty|quantity)?\\s*(\\d+)\\s*(?:件|个|箱|pcs?|pieces?|cartons?|boxes?)");
  private static final Pattern WEIGHT_PATTERN = Pattern.compile("(?i)(?:单重|每件|unit\\s*weight|each|weight|wt)?\\s*([0-9][0-9.,]*)\\s*(kg|kgs|公斤|千克|g|克|t|吨)");
  private static final Pattern MODEL_PATTERN = Pattern.compile("(?i)(?:型号|model|spec)\\s*[:：]?\\s*([A-Za-z0-9._\\-\\/]+)");
  private static final Pattern HAS_DATA_PATTERN = Pattern.compile("(?i)(\\d+\\s*[x×*]\\s*\\d+)|(kg|kgs|cm|mm|skid|pallet|pcs|件|箱|尺寸|长|宽|高)");
  private static final Pattern HAS_LETTER_OR_HAN = Pattern.compile(".*[\\p{IsHan}A-Za-z].*");

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final ObjectProvider<ChatClient.Builder> chatClientBuilderProvider;
  private final boolean springAiEnabled;
  private volatile boolean tableReady = false;

  public TextRecognitionService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      ObjectProvider<ChatClient.Builder> chatClientBuilderProvider,
      @Value("${app.text-recognition.spring-ai-enabled:false}") boolean springAiEnabled
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.chatClientBuilderProvider = chatClientBuilderProvider;
    this.springAiEnabled = springAiEnabled;
  }

  @Transactional
  public Map<String, Object> createTask(TextRecognitionRequest request) {
    ensureTable();
    String text = cleanCell(request == null ? "" : request.text());
    if (text.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Text is required");
    }

    long taskId = insertTask(request);
    jdbcTemplate.update("UPDATE cp_text_recognition_tasks SET status = 'RUNNING' WHERE id = ?", taskId);
    try {
      RecognitionResult result = recognize(text, request == null ? "" : request.languageHint());
      String cleanedJson = objectMapper.writeValueAsString(result.cleanedRows());
      String issuesJson = objectMapper.writeValueAsString(result.issues());
      jdbcTemplate.update(
          """
          UPDATE cp_text_recognition_tasks
          SET status = 'SUCCEEDED',
              row_count = ?,
              valid_count = ?,
              issue_count = ?,
              cleaned_count = ?,
              cleaned_json = ?,
              issues_json = ?,
              agent_notes = ?,
              error_message = NULL,
              finished_at = ?
          WHERE id = ?
          """,
          result.rowCount(),
          result.validCount(),
          result.issueCount(),
          result.cleanedRows().size(),
          cleanedJson,
          issuesJson,
          result.agentNotes(),
          Timestamp.from(Instant.now()),
          taskId
      );
    } catch (Exception error) {
      jdbcTemplate.update(
          """
          UPDATE cp_text_recognition_tasks
          SET status = 'FAILED', error_message = ?, finished_at = ?
          WHERE id = ?
          """,
          trim(error.getMessage(), 1000),
          Timestamp.from(Instant.now()),
          taskId
      );
    }

    return getTask(taskId);
  }

  public List<Map<String, Object>> listTasks() {
    ensureTable();
    return jdbcTemplate.query(
        """
        SELECT id, task_no, source_channel, source_name, status, row_count, valid_count,
               issue_count, cleaned_count, agent_notes, error_message, created_at, updated_at, finished_at
        FROM cp_text_recognition_tasks
        ORDER BY created_at DESC, id DESC
        LIMIT 30
        """,
        (rs, rowNum) -> mapTaskRow(rs, false)
    );
  }

  public Map<String, Object> getTask(long id) {
    ensureTable();
    List<Map<String, Object>> rows = jdbcTemplate.query(
        """
        SELECT id, task_no, source_channel, source_name, status, row_count, valid_count,
               issue_count, cleaned_count, cleaned_json, issues_json, agent_notes, error_message,
               created_at, updated_at, finished_at
        FROM cp_text_recognition_tasks
        WHERE id = ?
        """,
        (rs, rowNum) -> mapTaskRow(rs, true),
        id
    );
    if (rows.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Text recognition task not found");
    }
    return rows.get(0);
  }

  public String cleanedJson(long id) {
    ensureTable();
    String json = jdbcTemplate.query(
        "SELECT cleaned_json FROM cp_text_recognition_tasks WHERE id = ?",
        (rs) -> rs.next() ? rs.getString("cleaned_json") : null,
        id
    );
    if (json == null) {
      getTask(id);
      return "[]";
    }
    return json;
  }

  public byte[] cleanedWorkbook(long id) {
    ensureTable();
    List<Map<String, Object>> rows = parseJsonList(cleanedJson(id));
    try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      Sheet sheet = workbook.createSheet("text-recognition");
      Row headerRow = sheet.createRow(0);
      for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
        headerRow.createCell(i).setCellValue(OUTPUT_HEADERS.get(i));
      }
      for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
        Row sheetRow = sheet.createRow(rowIndex + 1);
        Map<String, Object> cargo = rows.get(rowIndex);
        for (int col = 0; col < OUTPUT_HEADERS.size(); col++) {
          Object value = cargo.get(OUTPUT_HEADERS.get(col));
          if (value instanceof Number number) {
            sheetRow.createCell(col).setCellValue(number.doubleValue());
          } else {
            sheetRow.createCell(col).setCellValue(value == null ? "" : String.valueOf(value));
          }
        }
      }
      for (int i = 0; i < OUTPUT_HEADERS.size(); i++) {
        sheet.autoSizeColumn(i);
      }
      workbook.write(output);
      return output.toByteArray();
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to export text recognition workbook");
    }
  }

  private void ensureTable() {
    if (tableReady) return;
    synchronized (this) {
      if (tableReady) return;
      jdbcTemplate.execute(
          """
          CREATE TABLE IF NOT EXISTS cp_text_recognition_tasks (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            task_no VARCHAR(40) NOT NULL UNIQUE,
            source_channel ENUM('LOCAL', 'AGENT') NOT NULL DEFAULT 'AGENT',
            source_name VARCHAR(255) NOT NULL DEFAULT 'pasted-text',
            status ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
            raw_text LONGTEXT NOT NULL,
            row_count INT NOT NULL DEFAULT 0,
            valid_count INT NOT NULL DEFAULT 0,
            issue_count INT NOT NULL DEFAULT 0,
            cleaned_count INT NOT NULL DEFAULT 0,
            cleaned_json LONGTEXT NULL,
            issues_json LONGTEXT NULL,
            agent_notes TEXT NULL,
            error_message TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            finished_at DATETIME NULL,
            INDEX idx_cp_text_recognition_tasks_status_time (status, created_at),
            INDEX idx_cp_text_recognition_tasks_created_at (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
          """
      );
      tableReady = true;
    }
  }

  private long insertTask(TextRecognitionRequest request) {
    String taskNo = "TEXT-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT);
    String sourceName = cleanCell(request == null ? "" : request.sourceName());
    String source = normalizeSource(request == null ? "" : request.mode());
    String text = cleanCell(request == null ? "" : request.text());
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update((connection) -> {
      PreparedStatement ps = connection.prepareStatement(
          """
          INSERT INTO cp_text_recognition_tasks (task_no, source_channel, source_name, raw_text, status)
          VALUES (?, ?, ?, ?, 'PENDING')
          """,
          Statement.RETURN_GENERATED_KEYS
      );
      ps.setString(1, taskNo);
      ps.setString(2, source);
      ps.setString(3, trim(sourceName.isBlank() ? "pasted-text" : sourceName, 255));
      ps.setString(4, text);
      return ps;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create text recognition task");
    }
    return key.longValue();
  }

  private RecognitionResult recognize(String text, String languageHint) {
    if (springAiEnabled) {
      ChatClient.Builder builder = chatClientBuilderProvider.getIfAvailable();
      if (builder != null) {
        try {
          return recognizeWithSpringAi(builder.build(), text, languageHint);
        } catch (Exception error) {
          RecognitionResult fallback = recognizeWithRules(text);
          return fallback.withNotes("Spring AI 识别失败，已自动切换到规则兜底：" + trim(error.getMessage(), 160));
        }
      }
    }
    RecognitionResult fallback = recognizeWithRules(text);
    if (springAiEnabled) {
      return fallback.withNotes("Spring AI 已启用但未找到可用 ChatClient，已使用规则兜底。");
    }
    return fallback.withNotes("当前未启用 Spring AI，已使用规则兜底；配置 API Key 后可切换为模型识别。");
  }

  private RecognitionResult recognizeWithSpringAi(ChatClient chatClient, String text, String languageHint) throws JsonProcessingException {
    String content = chatClient.prompt()
        .system(systemPrompt())
        .user(userPrompt(text, languageHint))
        .call()
        .content();
    Map<String, Object> payload = objectMapper.readValue(extractJsonObject(content), new TypeReference<Map<String, Object>>() {});
    List<Map<String, Object>> rawRows = mapList(payload.get("rows"));
    List<Map<String, Object>> modelIssues = mapList(payload.get("issues"));
    List<Map<String, Object>> validRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();

    int rowNumber = 0;
    for (Map<String, Object> rawRow : rawRows) {
      rowNumber++;
      ParsedCargo parsed = normalizeCargo(rawRow, rowNumber, cleanCell(rawRow.get("sourceText")));
      if (parsed.errors().isEmpty()) {
        validRows.add(parsed.cargo());
      } else {
        issues.add(buildIssue(rowNumber, parsed.text(), parsed.errors(), parsed.cargo()));
      }
    }

    for (Map<String, Object> modelIssue : modelIssues) {
      int issueRowNumber = intValue(modelIssue.get("rowNumber"), ++rowNumber);
      String issueText = cleanCell(firstNonBlank(modelIssue.get("text"), modelIssue.get("sourceText")));
      List<String> errors = stringList(modelIssue.get("errors"));
      if (errors.isEmpty()) errors = List.of(cleanCell(modelIssue.get("message")).isBlank() ? "模型未能确认该行货物规格" : cleanCell(modelIssue.get("message")));
      issues.add(buildIssue(issueRowNumber, issueText, errors, Map.of()));
    }

    if (validRows.isEmpty() && issues.isEmpty()) {
      throw new IllegalStateException("Spring AI did not return recognizable rows");
    }

    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String notes = cleanCell(payload.get("notes"));
    if (notes.isBlank()) {
      notes = "Spring AI 已完成文本结构化抽取，并按系统字段校验、聚合同名同规格货物。";
    }
    return new RecognitionResult(Math.max(rawRows.size() + modelIssues.size(), textRows(text).size()), validRows.size(), issues.size(), cleanedRows, issues, notes);
  }

  private RecognitionResult recognizeWithRules(String text) {
    List<String> lines = textRows(text);
    List<Map<String, Object>> validRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    String currentName = "";

    for (int index = 0; index < lines.size(); index++) {
      String line = lines.get(index);
      int rowNumber = index + 1;
      if (isHeading(line)) {
        continue;
      }

      ParsedCargo parsed = parseLine(line, currentName, rowNumber);
      if (parsed.matched()) {
        if (parsed.errors().isEmpty()) {
          validRows.add(parsed.cargo());
          currentName = cleanCell(parsed.cargo().get("name"));
        } else {
          issues.add(buildIssue(rowNumber, parsed.text(), parsed.errors(), parsed.cargo()));
        }
        continue;
      }

      if (looksLikeContextName(line)) {
        currentName = cleanContextName(line);
      } else if (HAS_DATA_PATTERN.matcher(line).find()) {
        issues.add(buildIssue(rowNumber, line, List.of("未能识别完整货物规格，请补充名称、长宽高、数量和重量"), Map.of("name", currentName)));
      }
    }

    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    return new RecognitionResult(lines.size(), validRows.size(), issues.size(), cleanedRows, issues, "规则兜底已完成：支持中英文尺寸、skids/pallets/pcs、每件重量、总重换算和同名多尺寸自动型号。");
  }

  private ParsedCargo parseLine(String line, String currentName, int rowNumber) {
    Matcher skid = SKID_LINE_PATTERN.matcher(line);
    if (skid.matches()) {
      String pack = cleanCell(skid.group("pack")).toLowerCase(Locale.ROOT);
      String name = firstNonBlank(skid.group("name"), currentName, inferNameFromLine(line, rowNumber));
      Map<String, Object> cargo = cargoMap(
          name,
          "",
          convertDimension(parseFlexibleNumber(skid.group("length")), skid.group("dimensionUnit")),
          convertDimension(parseFlexibleNumber(skid.group("width")), skid.group("dimensionUnit")),
          convertDimension(parseFlexibleNumber(skid.group("height")), skid.group("dimensionUnit")),
          intValue(skid.group("quantity"), 1),
          parseFlexibleNumber(skid.group("weight")),
          isPalletLike(pack) ? "pallet" : normalizeType(line),
          "",
          "",
          "文本识别：" + pack
      );
      List<String> errors = validateCargo(cargo);
      return new ParsedCargo(true, line, cargo, errors);
    }

    Matcher dimension = DIMENSION_LINE_PATTERN.matcher(line);
    if (dimension.matches()) {
      String namePart = cleanCell(dimension.group("name"));
      String tail = cleanCell(dimension.group("tail"));
      String name = firstNonBlank(extractName(namePart), currentName, inferNameFromLine(line, rowNumber));
      String model = firstNonBlank(extractModel(namePart), extractModel(tail));
      Integer quantity = firstInteger(QUANTITY_PATTERN, line, 1);
      Double weightKg = firstWeight(line);
      if (weightKg != null && quantity != null && quantity > 0 && isTotalWeightLine(line)) {
        weightKg = weightKg / quantity;
      }
      Map<String, Object> cargo = cargoMap(
          name,
          model,
          convertDimension(parseFlexibleNumber(dimension.group("length")), dimension.group("dimensionUnit")),
          convertDimension(parseFlexibleNumber(dimension.group("width")), dimension.group("dimensionUnit")),
          convertDimension(parseFlexibleNumber(dimension.group("height")), dimension.group("dimensionUnit")),
          quantity == null ? 1 : quantity,
          weightKg == null ? 0 : weightKg,
          normalizeType(line),
          "",
          "",
          tail
      );
      List<String> errors = validateCargo(cargo);
      return new ParsedCargo(true, line, cargo, errors);
    }

    return new ParsedCargo(false, line, Map.of(), List.of());
  }

  private ParsedCargo normalizeCargo(Map<String, Object> row, int rowNumber, String sourceText) {
    Map<String, Object> cargo = cargoMap(
        cleanCell(row.get("name")),
        cleanCell(firstNonBlank(row.get("model"), row.get("spec"))),
        numberOrZero(row.get("lengthCm")),
        numberOrZero(row.get("widthCm")),
        numberOrZero(row.get("heightCm")),
        intValue(row.get("quantity"), 0),
        numberOrZero(firstNonBlank(row.get("weightKg"), row.get("unitWeightKg"))),
        normalizeType(firstNonBlank(row.get("type"), row.get("remark"))),
        normalizeColor(row.get("color")),
        cleanCell(firstNonBlank(row.get("sku"), row.get("id"))),
        cleanCell(row.get("remark"))
    );
    List<String> errors = validateCargo(cargo);
    return new ParsedCargo(true, sourceText.isBlank() ? "AI row " + rowNumber : sourceText, cargo, errors);
  }

  private Map<String, Object> cargoMap(
      String name,
      String model,
      Double lengthCm,
      Double widthCm,
      Double heightCm,
      Integer quantity,
      Double weightKg,
      String type,
      String color,
      String sku,
      String remark
  ) {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("name", cleanCell(name));
    cargo.put("model", cleanCell(model));
    cargo.put("lengthCm", round2(lengthCm));
    cargo.put("widthCm", round2(widthCm));
    cargo.put("heightCm", round2(heightCm));
    cargo.put("quantity", quantity == null ? 0 : quantity);
    cargo.put("weightKg", round2(weightKg));
    cargo.put("type", firstNonBlank(type, "normal"));
    cargo.put("color", normalizeColor(color));
    cargo.put("sku", cleanCell(sku));
    cargo.put("remark", cleanCell(remark));
    return cargo;
  }

  private Map<String, Object> buildIssue(int rowNumber, String text, List<String> errors, Map<String, Object> cargo) {
    Map<String, Object> suggestionCargo = new LinkedHashMap<>(cargo);
    suggestionCargo.putIfAbsent("name", firstNonBlank(cargo.get("name"), "第" + rowNumber + "行货物"));
    suggestionCargo.putIfAbsent("quantity", 1);
    suggestionCargo.putIfAbsent("weightKg", 0);
    suggestionCargo.putIfAbsent("type", "normal");
    Map<String, Object> suggestion = new LinkedHashMap<>();
    suggestion.put("cargo", suggestionCargo);
    suggestion.put("errors", validateCargo(suggestionCargo));
    suggestion.put("notes", List.of("建议由用户确认后再导入"));

    Map<String, Object> issue = new LinkedHashMap<>();
    issue.put("rowNumber", rowNumber);
    issue.put("text", text);
    issue.put("errors", errors);
    issue.put("suggestion", suggestion);
    return issue;
  }

  private List<Map<String, Object>> aggregateCargos(List<Map<String, Object>> cargos) {
    Map<String, Map<String, Object>> aggregate = new LinkedHashMap<>();
    for (Map<String, Object> cargo : cargos) {
      String key = List.of(
          String.valueOf(cargo.getOrDefault("sku", "")),
          String.valueOf(cargo.getOrDefault("name", "")),
          String.valueOf(cargo.getOrDefault("model", "")),
          String.valueOf(cargo.getOrDefault("lengthCm", "")),
          String.valueOf(cargo.getOrDefault("widthCm", "")),
          String.valueOf(cargo.getOrDefault("heightCm", "")),
          String.valueOf(cargo.getOrDefault("weightKg", "")),
          String.valueOf(cargo.getOrDefault("type", "")),
          String.valueOf(cargo.getOrDefault("color", ""))
      ).toString();
      Map<String, Object> existing = aggregate.get(key);
      if (existing == null) {
        aggregate.put(key, new LinkedHashMap<>(cargo));
      } else {
        existing.put("quantity", intValue(existing.get("quantity"), 0) + intValue(cargo.get("quantity"), 0));
      }
    }
    return assignCargoModels(new ArrayList<>(aggregate.values()));
  }

  private List<Map<String, Object>> assignCargoModels(List<Map<String, Object>> cargos) {
    Map<String, List<Map<String, Object>>> byName = new LinkedHashMap<>();
    for (Map<String, Object> cargo : cargos) {
      String name = cleanCell(cargo.get("name"));
      if (!name.isBlank()) {
        byName.computeIfAbsent(name, ignored -> new ArrayList<>()).add(cargo);
      }
    }

    List<Map<String, Object>> result = new ArrayList<>();
    for (Map<String, Object> cargo : cargos) {
      Map<String, Object> next = new LinkedHashMap<>(cargo);
      List<Map<String, Object>> siblings = byName.getOrDefault(cleanCell(cargo.get("name")), List.of());
      List<String> dimensionKeys = siblings.stream().map(this::dimensionKey).distinct().sorted(this::compareDimensionKey).toList();
      if (dimensionKeys.size() > 1 && cleanCell(cargo.get("model")).isBlank()) {
        int index = Math.max(0, dimensionKeys.indexOf(dimensionKey(cargo)));
        next.put("model", "型号 " + modelLabel(index));
      }
      result.add(next);
    }
    return result;
  }

  private List<String> validateCargo(Map<String, Object> cargo) {
    List<String> errors = new ArrayList<>();
    if (cleanCell(cargo.get("name")).isBlank()) errors.add("缺少货物名称");
    if (numberValue(cargo.get("lengthCm")) <= 0) errors.add("长度必须大于 0");
    if (numberValue(cargo.get("widthCm")) <= 0) errors.add("宽度必须大于 0");
    if (numberValue(cargo.get("heightCm")) <= 0) errors.add("高度必须大于 0");
    if (intValue(cargo.get("quantity"), 0) <= 0) errors.add("数量必须是正整数");
    if (numberValue(cargo.get("weightKg")) < 0) errors.add("单件重量必须大于等于 0");
    return errors;
  }

  private String systemPrompt() {
    return """
        You are a cargo import data extraction agent for a container packing system.
        Return strict JSON only. Do not wrap it in Markdown.
        Extract cargo rows from messy Chinese or English shipment text.
        Output schema:
        {
          "rows": [
            {
              "sourceText": "original line or clause",
              "name": "cargo name",
              "model": "model/specification, empty if unknown",
              "lengthCm": 0,
              "widthCm": 0,
              "heightCm": 0,
              "quantity": 1,
              "weightKg": 0,
              "type": "normal|pallet|upright|nonstack",
              "remark": "short note"
            }
          ],
          "issues": [
            {"rowNumber": 1, "text": "raw text", "errors": ["missing dimension"]}
          ],
          "notes": "short Chinese summary"
        }
        Rules:
        - All dimensions must be centimeters.
        - All weights must be kilograms per single item.
        - English examples like "2 skids - each 31.200 kgs / 1080 x 200 x 340 cm" mean quantity=2, weightKg=31200, dimensions in cm.
        - If one product title is followed by multiple skid lines, use that title as the name for those rows.
        - If the same name has different dimensions and no model, leave model empty; the backend will assign 型号 A/B/C.
        - Map skids, pallets, wooden cases and crates to type "pallet"; fragile/no stack to "nonstack"; this side up/upright to "upright"; otherwise "normal".
        """;
  }

  private String userPrompt(String text, String languageHint) {
    String hint = cleanCell(languageHint);
    return "Language hint: " + (hint.isBlank() ? "auto" : hint) + "\nRaw cargo text:\n" + text;
  }

  private String extractJsonObject(String content) {
    String text = cleanCell(content);
    int start = text.indexOf('{');
    int end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new IllegalStateException("Spring AI response did not contain JSON object");
    }
    return text.substring(start, end + 1);
  }

  private List<String> textRows(String text) {
    return String.valueOf(text == null ? "" : text).lines()
        .map(this::cleanCell)
        .filter(line -> !line.isBlank())
        .toList();
  }

  private boolean isHeading(String line) {
    String text = cleanCell(line);
    if (text.isBlank()) return true;
    String lower = text.toLowerCase(Locale.ROOT);
    return lower.equals("cargo:") || lower.equals("cargo") || lower.equals("goods:") || lower.equals("货物:");
  }

  private boolean looksLikeContextName(String line) {
    String text = cleanCell(line);
    return text.length() <= 80 && HAS_LETTER_OR_HAN.matcher(text).matches() && !HAS_DATA_PATTERN.matcher(text).find();
  }

  private String cleanContextName(String line) {
    return cleanCell(line).replaceAll("[:：]+$", "");
  }

  private String extractName(String namePart) {
    String text = cleanCell(namePart);
    if (text.isBlank()) return "";
    text = MODEL_PATTERN.matcher(text).replaceAll("");
    return text.replaceAll("(?i)\\b(qty|quantity|pcs|pieces|件|数量)\\b.*$", "").trim();
  }

  private String inferNameFromLine(String line, int rowNumber) {
    Matcher matcher = Pattern.compile("^[\\p{IsHan}A-Za-z][\\p{IsHan}A-Za-z0-9._\\-\\s]{0,40}").matcher(line);
    if (matcher.find()) {
      String name = cleanCell(matcher.group());
      if (!name.isBlank() && !name.matches("\\d+.*")) return name;
    }
    return "第" + rowNumber + "行货物";
  }

  private String extractModel(String text) {
    Matcher matcher = MODEL_PATTERN.matcher(cleanCell(text));
    return matcher.find() ? matcher.group(1) : "";
  }

  private Integer firstInteger(Pattern pattern, String text, int groupIndex) {
    Matcher matcher = pattern.matcher(text);
    if (!matcher.find()) return null;
    return intValue(matcher.group(groupIndex), 0);
  }

  private Double firstWeight(String text) {
    Matcher matcher = WEIGHT_PATTERN.matcher(text);
    if (!matcher.find()) return null;
    double value = parseFlexibleNumber(matcher.group(1));
    String unit = matcher.group(2).toLowerCase(Locale.ROOT);
    if ("g".equals(unit) || "克".equals(unit)) return value / 1000;
    if ("t".equals(unit) || "吨".equals(unit)) return value * 1000;
    return value;
  }

  private boolean isTotalWeightLine(String text) {
    String lower = cleanCell(text).toLowerCase(Locale.ROOT);
    return lower.contains("总重") || lower.contains("总重量") || lower.contains("total weight") || lower.contains("gross weight");
  }

  private double convertDimension(double value, String unit) {
    String normalized = cleanCell(unit).toLowerCase(Locale.ROOT);
    if ("mm".equals(normalized) || "毫米".equals(normalized)) return value / 10;
    if ("m".equals(normalized) || "米".equals(normalized)) return value * 100;
    return value;
  }

  private double parseFlexibleNumber(Object value) {
    String text = cleanCell(value).replace(" ", "");
    if (text.isBlank()) return 0;
    if (text.matches("\\d{1,3}(?:\\.\\d{3})+")) {
      return Double.parseDouble(text.replace(".", ""));
    }
    if (text.matches("\\d{1,3}(?:,\\d{3})+")) {
      return Double.parseDouble(text.replace(",", ""));
    }
    if (text.contains(",") && !text.contains(".")) {
      return Double.parseDouble(text.replace(",", "."));
    }
    if (text.contains(",") && text.contains(".")) {
      return Double.parseDouble(text.replace(",", ""));
    }
    return Double.parseDouble(text);
  }

  private String normalizeType(Object... values) {
    String text = "";
    for (Object value : values) {
      text += " " + cleanCell(value).toLowerCase(Locale.ROOT);
    }
    if (text.contains("不可重压") || text.contains("不能重压") || text.contains("易碎") || text.contains("fragile")
        || text.contains("nonstack") || text.contains("non-stack") || text.contains("no stack")) {
      return "nonstack";
    }
    if (text.contains("托盘") || text.contains("木箱") || text.contains("pallet") || text.contains("skid")
        || text.contains("crate") || text.contains("wood")) {
      return "pallet";
    }
    if (text.contains("朝上") || text.contains("向上") || text.contains("upright") || text.contains("this side up")) {
      return "upright";
    }
    return "normal";
  }

  private boolean isPalletLike(String pack) {
    String text = cleanCell(pack).toLowerCase(Locale.ROOT);
    return text.contains("skid") || text.contains("pallet") || text.contains("托");
  }

  private String normalizeColor(Object value) {
    String text = cleanCell(value);
    return text.matches("^#[0-9a-fA-F]{6}$") ? text : "";
  }

  private String dimensionKey(Map<String, Object> cargo) {
    return List.of(
        String.valueOf(round2(numberValue(cargo.get("lengthCm")))),
        String.valueOf(round2(numberValue(cargo.get("widthCm")))),
        String.valueOf(round2(numberValue(cargo.get("heightCm")))),
        String.valueOf(round2(numberValue(cargo.get("weightKg")))),
        String.valueOf(cargo.getOrDefault("type", "normal"))
    ).stream().reduce((left, right) -> left + "|" + right).orElse("");
  }

  private int compareDimensionKey(String a, String b) {
    String[] aParts = a.split("\\|");
    String[] bParts = b.split("\\|");
    for (int i = 0; i < 4; i++) {
      double diff = numberValue(i < aParts.length ? aParts[i] : "0") - numberValue(i < bParts.length ? bParts[i] : "0");
      if (Math.abs(diff) > 0.0001) return diff > 0 ? 1 : -1;
    }
    String aType = aParts.length > 4 ? aParts[4] : "";
    String bType = bParts.length > 4 ? bParts[4] : "";
    return aType.compareTo(bType);
  }

  private String modelLabel(int index) {
    String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (index < alphabet.length()) return String.valueOf(alphabet.charAt(index));
    return alphabet.charAt(index % alphabet.length()) + String.valueOf(index / alphabet.length() + 1);
  }

  private double numberOrZero(Object value) {
    return round2(numberValue(value));
  }

  private double numberValue(Object value) {
    if (value instanceof Number number) return number.doubleValue();
    String text = cleanCell(value);
    if (text.isBlank()) return 0;
    Matcher matcher = Pattern.compile("-?\\d+(?:[.,]\\d+)?").matcher(text);
    if (!matcher.find()) return 0;
    try {
      return parseFlexibleNumber(matcher.group());
    } catch (NumberFormatException error) {
      return 0;
    }
  }

  private int intValue(Object value, int fallback) {
    if (value instanceof Number number) return number.intValue();
    String text = cleanCell(value);
    if (text.isBlank()) return fallback;
    Matcher matcher = Pattern.compile("-?\\d+").matcher(text);
    if (!matcher.find()) return fallback;
    try {
      return Integer.parseInt(matcher.group());
    } catch (NumberFormatException error) {
      return fallback;
    }
  }

  private double round2(Double value) {
    if (value == null) return 0;
    return Math.round(value * 100.0) / 100.0;
  }

  private String firstNonBlank(Object... values) {
    for (Object value : values) {
      String text = cleanCell(value);
      if (!text.isBlank()) return text;
    }
    return "";
  }

  private String cleanCell(Object value) {
    if (value == null) return "";
    return String.valueOf(value).replace("\uFEFF", "").trim();
  }

  private String trim(String value, int length) {
    if (value == null) return null;
    return value.length() <= length ? value : value.substring(0, length);
  }

  private String normalizeSource(String mode) {
    return "local".equalsIgnoreCase(cleanCell(mode)) ? "LOCAL" : "AGENT";
  }

  private List<Map<String, Object>> mapList(Object value) {
    if (value instanceof List<?> list) {
      List<Map<String, Object>> result = new ArrayList<>();
      for (Object item : list) {
        if (item instanceof Map<?, ?> map) {
          Map<String, Object> row = new LinkedHashMap<>();
          map.forEach((key, mapValue) -> row.put(String.valueOf(key), mapValue));
          result.add(row);
        }
      }
      return result;
    }
    return List.of();
  }

  private List<String> stringList(Object value) {
    if (value instanceof List<?> list) {
      return list.stream().map(this::cleanCell).filter(text -> !text.isBlank()).toList();
    }
    String text = cleanCell(value);
    return text.isBlank() ? List.of() : List.of(text);
  }

  private Map<String, Object> mapTaskRow(ResultSet rs, boolean includePayload) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("taskNo", rs.getString("task_no"));
    row.put("sourceChannel", rs.getString("source_channel"));
    row.put("sourceName", rs.getString("source_name"));
    row.put("status", rs.getString("status"));
    row.put("rowCount", rs.getInt("row_count"));
    row.put("validCount", rs.getInt("valid_count"));
    row.put("issueCount", rs.getInt("issue_count"));
    row.put("cleanedCount", rs.getInt("cleaned_count"));
    row.put("agentNotes", rs.getString("agent_notes"));
    row.put("errorMessage", rs.getString("error_message"));
    row.put("createdAt", stringTimestamp(rs, "created_at"));
    row.put("updatedAt", stringTimestamp(rs, "updated_at"));
    row.put("finishedAt", stringTimestamp(rs, "finished_at"));
    if (includePayload) {
      row.put("cleanedRows", parseJsonList(rs.getString("cleaned_json")));
      row.put("issues", parseJsonList(rs.getString("issues_json")));
    }
    return row;
  }

  private List<Map<String, Object>> parseJsonList(String json) {
    if (json == null || json.isBlank()) return List.of();
    try {
      return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
    } catch (JsonProcessingException error) {
      return List.of();
    }
  }

  private String stringTimestamp(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant().toString();
  }

  private record ParsedCargo(
      boolean matched,
      String text,
      Map<String, Object> cargo,
      List<String> errors
  ) {}

  private record RecognitionResult(
      int rowCount,
      int validCount,
      int issueCount,
      List<Map<String, Object>> cleanedRows,
      List<Map<String, Object>> issues,
      String agentNotes
  ) {
    RecognitionResult withNotes(String notes) {
      return new RecognitionResult(rowCount, validCount, issueCount, cleanedRows, issues, notes);
    }
  }
}
