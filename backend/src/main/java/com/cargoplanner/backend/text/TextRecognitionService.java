package com.cargoplanner.backend.text;

import com.cargoplanner.backend.admin.LlmSettingsService;
import com.cargoplanner.backend.admin.LlmSettingsService.LlmRuntimeSettings;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
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
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

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
  private static final Pattern THOUSAND_KG_PATTERN = Pattern.compile("(?i)(?<!\\d)([0-9]{1,3}\\.[0-9]{3}(?:\\.[0-9]{3})*)\\s*(?:kgs?|kg|公斤|千克)");
  private static final Pattern MODEL_PATTERN = Pattern.compile("(?i)(?:型号|model|spec)\\s*[:：]?\\s*([A-Za-z0-9._\\-\\/]+)");
  private static final Pattern HAS_DATA_PATTERN = Pattern.compile("(?i)(\\d+\\s*[x×*]\\s*\\d+)|(kg|kgs|cm|mm|skid|pallet|pcs|件|箱|尺寸|长|宽|高)");
  private static final Pattern HAS_LETTER_OR_HAN = Pattern.compile(".*[\\p{IsHan}A-Za-z].*");
  private static final Pattern FLEX_DIMENSION_PATTERN = Pattern.compile(
      "(?i)(?:长|length|l)?\\s*(?<length>[0-9][0-9.,]*)\\s*(?<unit1>cm|mm|m|厘米|毫米|米)?\\s*[xX×*]\\s*"
          + "(?:宽|width|w)?\\s*(?<width>[0-9][0-9.,]*)\\s*(?<unit2>cm|mm|m|厘米|毫米|米)?\\s*[xX×*]\\s*"
          + "(?:高|height|h)?\\s*(?<height>[0-9][0-9.,]*)\\s*(?<unit3>cm|mm|m|厘米|毫米|米)?"
  );
  private static final Pattern CSV_SPLIT_PATTERN = Pattern.compile("\\s*[,，\\t]\\s*");
  private static final Pattern FLEX_QUANTITY_PATTERN = Pattern.compile(
      "(?i)(?:数量|qty|quantity)?\\s*(\\d+)\\s*(?:件|个|箱|盒|pcs?|pieces?|cartons?|boxes?|双|套|只|台|包|袋|页|片|张)"
  );
  private static final Pattern FLEX_WEIGHT_PATTERN = Pattern.compile(
      "(?i)(?:单重|每件|单箱毛重|毛重|净重|unit\\s*weight|each|weight|wt)?\\s*([0-9][0-9.,]*)\\s*(kg|kgs|公斤|千克|g|克|t|吨)"
  );

  private final JdbcTemplate jdbcTemplate;
  private final ObjectMapper objectMapper;
  private final LlmSettingsService llmSettingsService;
  private final RestTemplate restTemplate = new RestTemplate();
  private volatile boolean tableReady = false;

  public TextRecognitionService(
      JdbcTemplate jdbcTemplate,
      ObjectMapper objectMapper,
      LlmSettingsService llmSettingsService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.objectMapper = objectMapper;
    this.llmSettingsService = llmSettingsService;
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
    boolean formattedExcelAgentInput = isFormattedExcelAgentInput(text);
    if (!formattedExcelAgentInput) {
      RecognitionResult packingListResult = recognizePackingListTable(text);
      if (packingListResult != null) {
        return packingListResult;
      }
    }

    LlmRuntimeSettings settings = llmSettingsService.runtimeSettings();
    if (settings.enabled()) {
      if (settings.hasApiKey()) {
        try {
          return recognizeWithOpenAiCompatible(settings, text, languageHint);
        } catch (Exception error) {
          if (formattedExcelAgentInput) {
            throw new IllegalStateException("Excel 格式化识别必须走 Agent，当前调用失败：" + trim(error.getMessage(), 180), error);
          }
          RecognitionResult fallback = recognizeWithRules(text);
          return fallback.withNotes("LLM 识别失败，已自动切换到规则兜底：" + trim(error.getMessage(), 160));
        }
      }
      if (formattedExcelAgentInput) {
        throw new IllegalStateException("Excel 格式化识别必须走 Agent，请先在后台配置 LLM API Key。");
      }
      RecognitionResult fallback = recognizeWithRules(text);
      return fallback.withNotes("LLM 默认启用，但管理员尚未配置 API Key，已使用规则兜底。");
    }
    if (formattedExcelAgentInput) {
      throw new IllegalStateException("Excel 格式化识别必须走 Agent，请先在后台启用 LLM 识别。");
    }
    RecognitionResult fallback = recognizeWithRules(text);
    return fallback.withNotes("管理员已关闭 LLM 识别，当前使用规则兜底。");
  }

  private boolean isFormattedExcelAgentInput(String text) {
    return String.valueOf(text == null ? "" : text).contains("EXCEL_FORMATTED_TABLE_FOR_AGENT");
  }

  private RecognitionResult recognizeWithOpenAiCompatible(LlmRuntimeSettings settings, String text, String languageHint) {
    String content = callOpenAiCompatibleChat(settings, text, languageHint);
    Map<String, Object> payload;
    try {
      payload = objectMapper.readValue(extractJsonObject(content), new TypeReference<Map<String, Object>>() {});
    } catch (JsonProcessingException error) {
      throw new IllegalStateException(
          "Agent 返回的 JSON 不完整或格式错误，请重试；如果是大表，请减少无关工作表或空白行。详情：" + trim(error.getOriginalMessage(), 160),
          error
      );
    }
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
        List<String> reviewWarnings = reviewWarnings(parsed.cargo(), parsed.text());
        if (!reviewWarnings.isEmpty()) {
          issues.add(buildIssue(rowNumber, parsed.text(), reviewWarnings, parsed.cargo()));
        }
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

    int correctedWeightCount = applyThousandSeparatedWeightCorrections(validRows, text);
    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String notes = cleanCell(payload.get("notes"));
    if (notes.isBlank()) {
      notes = "LLM 已完成文本结构化抽取，并按系统字段校验、聚合同名同规格货物。";
    }
    if (correctedWeightCount > 0) {
      notes += "；已按原文千分位重量修正 " + correctedWeightCount + " 条（如 29.200 kgs = 29200 kg）。";
    }
    notes = notes + "（模型：" + settings.model() + "）";
    return new RecognitionResult(Math.max(rawRows.size() + modelIssues.size(), textRows(text).size()), validRows.size(), issues.size(), cleanedRows, issues, notes);
  }

  private String callOpenAiCompatibleChat(LlmRuntimeSettings settings, String text, String languageHint) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.setBearerAuth(settings.apiKey());

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("model", settings.model());
    body.put("temperature", 0.1);
    body.put("stream", false);
    body.put("max_tokens", 8192);
    body.put("response_format", Map.of("type", "json_object"));
    body.put("messages", List.of(
        Map.of("role", "system", "content", systemPrompt()),
        Map.of("role", "user", "content", userPrompt(text, languageHint))
    ));
    if (settings.baseUrl().toLowerCase(Locale.ROOT).contains("deepseek.com")) {
      body.put("thinking", Map.of("type", "disabled"));
    }

    try {
      ResponseEntity<Map> response = restTemplate.postForEntity(
          URI.create(chatCompletionsUrl(settings.baseUrl())),
          new HttpEntity<>(body, headers),
          Map.class
      );
      Object responseBody = response.getBody();
      if (!(responseBody instanceof Map<?, ?> payload)) {
        throw new IllegalStateException("LLM returned empty response body");
      }
      return extractAssistantContent(payload);
    } catch (HttpStatusCodeException error) {
      String message = providerErrorMessage(error.getResponseBodyAsString());
      throw new IllegalStateException("LLM HTTP " + error.getStatusCode().value() + ": " + message, error);
    } catch (RestClientException error) {
      throw new IllegalStateException("LLM request failed: " + error.getMessage(), error);
    }
  }

  private String chatCompletionsUrl(String baseUrl) {
    String url = cleanCell(baseUrl).replaceAll("/+$", "");
    if (url.isBlank()) {
      url = "https://api.deepseek.com";
    }
    if (url.endsWith("/chat/completions")) {
      return url;
    }
    if (url.toLowerCase(Locale.ROOT).contains("deepseek.com")) {
      return url.endsWith("/v1") ? url + "/chat/completions" : url + "/chat/completions";
    }
    if (url.endsWith("/v1")) {
      return url + "/chat/completions";
    }
    return url + "/v1/chat/completions";
  }

  private String extractAssistantContent(Map<?, ?> payload) {
    Object error = payload.get("error");
    if (error != null) {
      throw new IllegalStateException(providerErrorMessage(error));
    }
    Object choicesValue = payload.get("choices");
    if (choicesValue instanceof List<?> choices && !choices.isEmpty()) {
      Object first = choices.get(0);
      if (first instanceof Map<?, ?> choice) {
        String finishReason = cleanCell(choice.get("finish_reason"));
        if ("length".equalsIgnoreCase(finishReason)) {
          throw new IllegalStateException("Agent 输出达到长度上限，返回结果被截断。请重试或减少无关工作表、空白行。");
        }
        String content = contentText(choice.get("message"));
        if (content.isBlank()) content = contentText(choice.get("delta"));
        if (content.isBlank()) content = contentText(choice.get("text"));
        if (!content.isBlank()) return content;
      }
    }
    String content = contentText(payload.get("output_text"));
    if (content.isBlank()) content = contentText(payload.get("text"));
    if (!content.isBlank()) return content;
    throw new IllegalStateException("LLM response did not contain assistant content");
  }

  private String contentText(Object value) {
    if (value == null) return "";
    if (value instanceof String text) return cleanCell(text);
    if (value instanceof Map<?, ?> map) {
      String content = contentText(map.get("content"));
      if (content.isBlank()) content = contentText(map.get("text"));
      return content;
    }
    if (value instanceof List<?> list) {
      StringBuilder builder = new StringBuilder();
      for (Object item : list) {
        String part = contentText(item);
        if (!part.isBlank()) builder.append(part);
      }
      return cleanCell(builder.toString());
    }
    return cleanCell(value);
  }

  private String providerErrorMessage(Object value) {
    if (value == null) return "unknown provider error";
    if (value instanceof Map<?, ?> map) {
      String message = firstNonBlank(map.get("message"), map.get("msg"), map.get("type"), map.get("code"));
      if (!message.isBlank()) return message;
      Object nested = map.get("error");
      if (nested != null && nested != value) return providerErrorMessage(nested);
    }
    String text = cleanCell(value);
    if (text.startsWith("{")) {
      try {
        return providerErrorMessage(objectMapper.readValue(text, new TypeReference<Map<String, Object>>() {}));
      } catch (Exception ignored) {
        return trim(text, 300);
      }
    }
    return trim(text, 300);
  }

  private RecognitionResult recognizePackingListTable(String text) {
    if (!looksLikePackingListTable(text)) return null;

    List<String> lines = textRows(text);
    List<Map<String, Object>> validRows = new ArrayList<>();
    List<Map<String, Object>> issues = new ArrayList<>();
    for (int index = 0; index < lines.size(); index++) {
      ParsedCargo parsed = parsePackingListTableLine(lines.get(index), index + 1);
      if (!parsed.matched()) continue;
      if (parsed.errors().isEmpty()) {
        validRows.add(parsed.cargo());
      } else {
        issues.add(buildIssue(index + 1, parsed.text(), parsed.errors(), parsed.cargo()));
      }
    }

    if (validRows.isEmpty()) return null;
    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String notes = "识别为 PL 纸箱清单：按 T.CTNS/总箱数和 CARTON SIZE 导入；Order Qty/散件数量、PCS/CTN、PALLET SIZE、T.CBM 和托盘总重量仅作为备注，不参与装箱计算。";
    return new RecognitionResult(lines.size(), validRows.size(), issues.size(), cleanedRows, issues, notes);
  }

  private boolean looksLikePackingListTable(String text) {
    String lower = cleanCell(text).toLowerCase(Locale.ROOT);
    if (lower.isBlank()) return false;
    boolean hasCartonCount = lower.contains("t.ctns") || lower.contains("t. ctns")
        || lower.contains("total ctn") || lower.contains("总箱数");
    boolean hasPiecesPerCarton = lower.contains("pcs/ctn") || lower.contains("pcs / ctn")
        || lower.contains("个/箱") || lower.contains("每箱");
    boolean hasOrderQuantity = lower.contains("order qty") || lower.contains("订单数量")
        || lower.contains("总数量");
    boolean hasCartonSize = lower.contains("carton size") || lower.contains("纸箱尺寸")
        || lower.contains("单纸箱尺寸");
    return hasCartonCount && hasPiecesPerCarton && hasOrderQuantity && hasCartonSize;
  }

  private ParsedCargo parsePackingListTableLine(String line, int rowNumber) {
    String text = cleanCell(line);
    if (text.isBlank()) return new ParsedCargo(false, line, Map.of(), List.of());

    String[] tokens = text.split("[\\s,，\\t]+");
    if (tokens.length < 11) return new ParsedCargo(false, line, Map.of(), List.of());

    String name = cleanCell(tokens[0]);
    if (name.isBlank() || name.matches("(?i)size|尺寸|total|合计")) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }

    List<Double> numbers = new ArrayList<>();
    for (int i = 1; i < tokens.length; i++) {
      Double number = firstNumberInToken(tokens[i]);
      if (number != null) numbers.add(number);
    }
    if (numbers.size() < 10) return new ParsedCargo(false, line, Map.of(), List.of());

    int totalCartons = Math.max(0, (int) Math.round(numbers.get(0)));
    double piecesPerCarton = numbers.get(1);
    double orderQuantity = numbers.get(2);
    double unitNetWeight = numbers.get(3);
    double unitGrossWeight = numbers.get(4);
    double totalNetWeight = numbers.size() > 5 ? numbers.get(5) : 0;
    double totalGrossWeight = numbers.size() > 6 ? numbers.get(6) : 0;
    double cartonLengthCm = numbers.get(7);
    double cartonWidthCm = numbers.get(8);
    double cartonHeightCm = numbers.get(9);
    if (unitGrossWeight <= 0 && totalGrossWeight > 0 && totalCartons > 0) {
      unitGrossWeight = totalGrossWeight / totalCartons;
    }

    if (totalCartons <= 0 || cartonLengthCm <= 0 || cartonWidthCm <= 0 || cartonHeightCm <= 0) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }

    String remark = "PL纸箱清单；Order Qty " + formatNumber(orderQuantity)
        + " 为散件数量不参与装箱；PCS/CTN " + formatNumber(piecesPerCarton)
        + " 仅备注；单箱净重 " + formatNumber(unitNetWeight)
        + "kg，总净重 " + formatNumber(totalNetWeight)
        + "kg，总毛重 " + formatNumber(totalGrossWeight) + "kg";
    if (numbers.size() >= 13) {
      remark += "；托盘尺寸 " + formatNumber(numbers.get(10)) + "x"
          + formatNumber(numbers.get(11)) + "x" + formatNumber(numbers.get(12))
          + "m 不是逐托导入尺寸";
    }
    if (numbers.size() >= 15) {
      remark += "；T.CBM " + formatNumber(numbers.get(13))
          + "、托盘总重 " + formatNumber(numbers.get(14)) + "kg 仅备注";
    }

    Map<String, Object> cargo = cargoMap(
        name,
        "",
        cartonLengthCm,
        cartonWidthCm,
        cartonHeightCm,
        totalCartons,
        unitGrossWeight,
        "normal",
        "",
        "",
        remark
    );
    cargo.put("packageInfo", packingListPackageInfo(
        "carton",
        totalCartons,
        cartonLengthCm,
        cartonWidthCm,
        cartonHeightCm,
        unitGrossWeight,
        totalGrossWeight,
        orderQuantity,
        piecesPerCarton
    ));
    List<String> errors = validateCargo(cargo);
    return new ParsedCargo(true, line, cargo, errors);
  }

  private Double firstNumberInToken(String token) {
    Matcher matcher = Pattern.compile("-?\\d+(?:[.,]\\d+)?").matcher(cleanCell(token));
    if (!matcher.find()) return null;
    try {
      return parseFlexibleNumber(matcher.group());
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private Map<String, Object> packingListPackageInfo(
      String packageUnit,
      int packageQuantity,
      double lengthCm,
      double widthCm,
      double heightCm,
      double packageGrossWeightKg,
      double totalGrossWeightKg,
      double innerTotalQuantity,
      double innerPiecesPerPackage
  ) {
    Map<String, Object> dimensions = new LinkedHashMap<>();
    dimensions.put("lengthCm", round2(lengthCm));
    dimensions.put("widthCm", round2(widthCm));
    dimensions.put("heightCm", round2(heightCm));

    Map<String, Object> innerCargo = new LinkedHashMap<>();
    if (innerTotalQuantity > 0) innerCargo.put("totalQuantity", Math.round(innerTotalQuantity));
    if (innerPiecesPerPackage > 0) innerCargo.put("piecesPerPackage", round2(innerPiecesPerPackage));
    if (!innerCargo.isEmpty()) innerCargo.put("quantityUnit", "pcs");

    Map<String, Object> info = new LinkedHashMap<>();
    info.put("algorithmBasis", "package-unit");
    info.put("packageUnit", firstNonBlank(packageUnit, "carton"));
    info.put("packageQuantity", packageQuantity);
    info.put("packageDimensionsCm", compactObject(dimensions));
    info.put("packageGrossWeightKg", round2(packageGrossWeightKg));
    info.put("packageTotalGrossWeightKg", totalGrossWeightKg > 0 ? round2(totalGrossWeightKg) : round2(packageGrossWeightKg * packageQuantity));
    if (!innerCargo.isEmpty()) info.put("innerCargo", innerCargo);
    return compactObject(info);
  }

  private Map<String, Object> compactObject(Map<String, Object> object) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (Map.Entry<String, Object> entry : object.entrySet()) {
      Object value = entry.getValue();
      if (value == null) continue;
      if (value instanceof String text && text.isBlank()) continue;
      if (value instanceof Number number && !Double.isFinite(number.doubleValue())) continue;
      if (value instanceof Map<?, ?> map && map.isEmpty()) continue;
      result.put(entry.getKey(), value);
    }
    return result;
  }

  private String formatNumber(double value) {
    if (Math.abs(value - Math.rint(value)) < 0.0001) return String.valueOf((long) Math.rint(value));
    return String.format(Locale.ROOT, "%.2f", value).replaceAll("0+$", "").replaceAll("\\.$", "");
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

    int correctedWeightCount = applyThousandSeparatedWeightCorrections(validRows, text);
    List<Map<String, Object>> cleanedRows = aggregateCargos(validRows);
    String notes = "规则兜底已完成：支持中英文尺寸、skids/pallets/pcs、每件重量、总重换算和同名多尺寸自动型号。";
    if (correctedWeightCount > 0) {
      notes += " 已按原文千分位重量修正 " + correctedWeightCount + " 条。";
    }
    return new RecognitionResult(lines.size(), validRows.size(), issues.size(), cleanedRows, issues, notes);
  }

  private ParsedCargo parseDelimitedLine(String line, String currentName, int rowNumber) {
    if (!line.contains(",") && !line.contains("，") && !line.contains("\t")) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }
    DimensionParts dimensions = extractDimensions(line);
    if (dimensions == null) {
      return new ParsedCargo(false, line, Map.of(), List.of());
    }

    List<String> tokens = CSV_SPLIT_PATTERN.splitAsStream(line)
        .map(this::cleanCell)
        .filter(token -> !token.isBlank())
        .toList();
    int startIndex = (!tokens.isEmpty() && tokens.get(0).matches("\\d+")) ? 1 : 0;
    String name = "";
    String model = "";
    for (int i = startIndex; i < tokens.size(); i++) {
      String token = tokens.get(i);
      if (isMeasurementToken(token)) continue;
      if (name.isBlank()) {
        name = token;
      } else if (model.isBlank()) {
        model = token;
        break;
      }
    }
    Integer quantity = firstDelimitedQuantity(tokens);
    Double weightKg = firstDelimitedWeight(tokens);

    Map<String, Object> cargo = cargoMap(
        firstNonBlank(name, currentName, inferNameFromLine(line, rowNumber)),
        model,
        dimensions.lengthCm(),
        dimensions.widthCm(),
        dimensions.heightCm(),
        quantity == null ? 1 : quantity,
        weightKg == null ? 0 : weightKg,
        normalizeType(line),
        "",
        "",
        line
    );
    List<String> errors = validateCargo(cargo);
    return new ParsedCargo(true, line, cargo, errors);
  }

  private ParsedCargo parseLine(String line, String currentName, int rowNumber) {
    ParsedCargo delimited = parseDelimitedLine(line, currentName, rowNumber);
    if (delimited.matched()) {
      return delimited;
    }

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
      cargo.put("packageInfo", packingListPackageInfo(
          isPalletLike(pack) ? "pallet" : "carton",
          intValue(skid.group("quantity"), 1),
          numberValue(cargo.get("lengthCm")),
          numberValue(cargo.get("widthCm")),
          numberValue(cargo.get("heightCm")),
          numberValue(cargo.get("weightKg")),
          numberValue(cargo.get("weightKg")) * intValue(cargo.get("quantity"), 1),
          0,
          0
      ));
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

  private DimensionParts extractDimensions(String text) {
    Matcher matcher = FLEX_DIMENSION_PATTERN.matcher(cleanCell(text));
    if (!matcher.find()) return null;
    String unit = firstNonBlank(matcher.group("unit1"), matcher.group("unit2"), matcher.group("unit3"), "cm");
    return new DimensionParts(
        convertFlexDimension(parseFlexibleNumber(matcher.group("length")), unit),
        convertFlexDimension(parseFlexibleNumber(matcher.group("width")), unit),
        convertFlexDimension(parseFlexibleNumber(matcher.group("height")), unit)
    );
  }

  private double convertFlexDimension(double value, String unit) {
    String normalized = cleanCell(unit).toLowerCase(Locale.ROOT);
    if ("mm".equals(normalized) || "毫米".equals(normalized)) return value / 10;
    if ("m".equals(normalized) || "米".equals(normalized)) return value * 100;
    return value;
  }

  private Integer firstDelimitedQuantity(List<String> tokens) {
    for (String token : tokens) {
      if (isDimensionToken(token) || FLEX_WEIGHT_PATTERN.matcher(token).find()) continue;
      Matcher matcher = FLEX_QUANTITY_PATTERN.matcher(token);
      if (matcher.find()) {
        return intValue(matcher.group(1), 0);
      }
    }
    return null;
  }

  private Double firstDelimitedWeight(List<String> tokens) {
    for (String token : tokens) {
      if (isDimensionToken(token)) continue;
      Matcher matcher = FLEX_WEIGHT_PATTERN.matcher(token);
      if (matcher.find()) {
        double value = parseFlexibleNumber(matcher.group(1));
        String unit = cleanCell(matcher.group(2)).toLowerCase(Locale.ROOT);
        if ("g".equals(unit) || "克".equals(unit)) return value / 1000;
        if ("t".equals(unit) || "吨".equals(unit)) return value * 1000;
        return value;
      }
    }
    return null;
  }

  private boolean isMeasurementToken(String token) {
    String text = cleanCell(token);
    if (text.matches("\\d+")) return true;
    return isDimensionToken(text)
        || FLEX_QUANTITY_PATTERN.matcher(text).matches()
        || FLEX_WEIGHT_PATTERN.matcher(text).matches();
  }

  private boolean isDimensionToken(String token) {
    return FLEX_DIMENSION_PATTERN.matcher(cleanCell(token)).find();
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
    if (row.get("packageInfo") instanceof Map<?, ?> packageInfo) {
      cargo.put("packageInfo", new LinkedHashMap<>(packageInfo));
    }
    applyPackageWeightFormula(cargo);
    List<String> errors = validateCargo(cargo);
    return new ParsedCargo(true, sourceText.isBlank() ? "AI row " + rowNumber : sourceText, cargo, errors);
  }

  @SuppressWarnings("unchecked")
  private void applyPackageWeightFormula(Map<String, Object> cargo) {
    Object packageInfoValue = cargo.get("packageInfo");
    if (!(packageInfoValue instanceof Map<?, ?> packageInfoRaw)) return;
    Map<String, Object> packageInfo = new LinkedHashMap<>((Map<String, Object>) packageInfoRaw);
    Map<String, Object> innerCargo = packageInfo.get("innerCargo") instanceof Map<?, ?> innerRaw
        ? new LinkedHashMap<>((Map<String, Object>) innerRaw)
        : new LinkedHashMap<>();
    int quantity = intValue(cargo.get("quantity"), 0);
    if (quantity <= 0) return;

    double palletTarePerUnit = numberValue(firstNonBlank(
        packageInfo.get("palletTareWeightKg"),
        packageInfo.get("packageTareWeightKg"),
        packageInfo.get("woodenPackageWeightKg"),
        packageInfo.get("tareWeightKg")
    ));
    double palletTareTotal = numberValue(firstNonBlank(
        packageInfo.get("palletTotalTareWeightKg"),
        packageInfo.get("packageTotalTareWeightKg"),
        packageInfo.get("woodenPackageTotalWeightKg"),
        packageInfo.get("tareTotalWeightKg")
    ));
    double cargoTotalWeight = numberValue(firstNonBlank(
        packageInfo.get("cargoTotalWeightKg"),
        packageInfo.get("containedCargoTotalGrossWeightKg"),
        innerCargo.get("totalGrossWeightKg"),
        innerCargo.get("cargoTotalWeightKg"),
        innerCargo.get("totalWeightKg")
    ));

    if (cargoTotalWeight <= 0 || (palletTarePerUnit <= 0 && palletTareTotal <= 0)) return;
    double tareTotal = palletTareTotal > 0 ? palletTareTotal : palletTarePerUnit * quantity;
    double packageTotalGrossWeight = tareTotal + cargoTotalWeight;
    double packageGrossWeight = packageTotalGrossWeight / quantity;
    cargo.put("weightKg", round2(packageGrossWeight));
    packageInfo.put("packageGrossWeightKg", round2(packageGrossWeight));
    packageInfo.put("packageTotalGrossWeightKg", round2(packageTotalGrossWeight));
    packageInfo.putIfAbsent("weightFormula", "pallet tare total + contained cargo gross total, divided by pallet quantity");
    cargo.put("packageInfo", compactObject(packageInfo));

    String remark = cleanCell(cargo.get("remark"));
    String note = "托盘单重已按托盘/木架重量+货物总毛重折算";
    if (!remark.contains(note)) {
      cargo.put("remark", remark.isBlank() ? note : remark + "；" + note);
    }
  }

  private List<String> reviewWarnings(Map<String, Object> cargo, String sourceText) {
    String text = String.join(" ",
        cleanCell(sourceText),
        cleanCell(cargo.get("name")),
        cleanCell(cargo.get("model")),
        cleanCell(cargo.get("remark")),
        cleanCell(cargo.get("type")),
        cleanCell(cargo.get("packageInfo"))
    ).toLowerCase(Locale.ROOT);
    List<String> warnings = new ArrayList<>();
    if (containsAny(text, "空托盘", "空托", "空木托", "empty pallet", "empty skid")) {
      warnings.add("复核：疑似空托盘/单独托盘，请确认是否需要作为独立装柜货物；若只是托盘皮重说明，应改入备注或删除该项。");
    }
    if (containsAny(text, "拼装", "拼托", "混装", "合拼", "共托", "mixed pallet", "combined pallet", "mixed skid", "combined skid")) {
      warnings.add("复核：疑似拼装/混装托盘，请确认尺寸为最终托盘尺寸，单重已包含托盘/木架和托盘内货物总重。");
    }
    if (containsAny(text, "可能", "不确定", "未确认", "疑似", "人工确认", "重复", "复核", "uncertain", "maybe", "possible", "duplicate")) {
      warnings.add("复核：识别内容带有可能、不确定、重复或人工确认信号，请对照原文核对后再导入。");
    }
    if ("pallet".equals(cleanCell(cargo.get("type")))
        && containsAny(text, "单独", "独立", "单个", "separate", "standalone", "alone")
        && containsAny(text, "托盘", "木托", "栈板", "pallet", "skid")) {
      warnings.add("复核：疑似单独托盘，请确认不是承托其他货物的空托盘，也不是重复计算的托盘行。");
    }
    if ("pallet".equals(cleanCell(cargo.get("type"))) && numberValue(cargo.get("weightKg")) <= 0) {
      warnings.add("复核：托盘/木箱单重为空或为 0，装箱计算会低估重量，请补全单重。");
    }
    return warnings.stream().distinct().toList();
  }

  private boolean containsAny(String text, String... words) {
    for (String word : words) {
      if (text.contains(word)) return true;
    }
    return false;
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
        Map<String, Object> mergedPackageInfo = mergePackageInfo(existing.get("packageInfo"), cargo.get("packageInfo"), intValue(existing.get("quantity"), 0));
        if (!mergedPackageInfo.isEmpty()) existing.put("packageInfo", mergedPackageInfo);
      }
    }
    return assignCargoModels(new ArrayList<>(aggregate.values()));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> mergePackageInfo(Object leftValue, Object rightValue, int packageQuantity) {
    Map<String, Object> left = leftValue instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    Map<String, Object> right = rightValue instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    if (left.isEmpty() && right.isEmpty()) return Map.of();
    Map<String, Object> base = new LinkedHashMap<>(left.isEmpty() ? right : left);
    base.put("packageQuantity", packageQuantity);

    Map<String, Object> leftInner = left.get("innerCargo") instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    Map<String, Object> rightInner = right.get("innerCargo") instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : new LinkedHashMap<>();
    double totalInnerQuantity = numberValue(leftInner.get("totalQuantity")) + numberValue(rightInner.get("totalQuantity"));
    if (totalInnerQuantity > 0) {
      Map<String, Object> inner = new LinkedHashMap<>(leftInner);
      inner.putAll(rightInner);
      inner.put("totalQuantity", Math.round(totalInnerQuantity));
      inner.putIfAbsent("quantityUnit", "pcs");
      base.put("innerCargo", inner);
    }

    double totalWeight = numberValue(left.get("packageTotalGrossWeightKg")) + numberValue(right.get("packageTotalGrossWeightKg"));
    if (totalWeight > 0) base.put("packageTotalGrossWeightKg", round2(totalWeight));
    return compactObject(base);
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
              "remark": "short note",
              "packageInfo": {
                "algorithmBasis": "package-unit",
                "packageUnit": "carton|pallet|crate",
                "packageQuantity": 1,
                "packageDimensionsCm": {"lengthCm": 0, "widthCm": 0, "heightCm": 0},
                "packageGrossWeightKg": 0,
                "packageTotalGrossWeightKg": 0,
                "palletTareWeightKg": 0,
                "cargoTotalWeightKg": 0,
                "weightFormula": "pallet tare total + contained cargo gross total, divided by pallet quantity",
                "innerCargo": {"totalQuantity": 0, "piecesPerPackage": 0, "totalGrossWeightKg": 0, "quantityUnit": "pcs"}
              }
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
        - The algorithm fields lengthCm,widthCm,heightCm,quantity,weightKg must always describe the final handled package unit: pallet, carton, crate, wooden case, or box. Never put loose-piece dimensions into these fields when the goods are shipped inside cartons/pallets.
        - If loose-piece/order details exist, store them only in packageInfo.innerCargo and/or remark. packageInfo is optional but recommended for packing-list rows.
        - For input beginning with EXCEL_FORMATTED_TABLE_FOR_AGENT, use the Excel coordinates, merged ranges, and neighboring rows/columns to understand the table layout. Do not blindly parse the first recognizable table.
        - If a sheet has product/carton details on the left and pallet/final-package columns on the right, output the right-side final pallet/package rows as the algorithm cargo. The left-side product/carton rows become inner contents only.
        - Chinese packing sheets with right-side headers such as 免熏蒸木托盘体积, 免熏蒸木托盘重量KG, 数量, 总体积m3, 重量KG, 托盘拼装 are final pallet-unit lists. Extract those pallets, not the left-side cartons.
        - For final pallet or wooden-package rows, weightKg must be the gross weight of one final handled unit. When the sheet gives pallet/wooden-package tare weight plus product gross weights, calculate: weightKg = (palletTareWeightKg * palletQuantity + containedCargoTotalGrossWeightKg) / palletQuantity. If the sheet gives a final gross total that clearly already includes pallet plus cargo, use finalGrossTotal / palletQuantity instead and mention it. Never use the bare pallet tare as weightKg when contained cargo weights are available.
        - When a right-side pallet cell spans or visually aligns with multiple left-side product rows, associate those product rows with that pallet. Example: a 116×116×168 cm pallet aligned with 明装筒灯 1000只/20箱 and 线条灯 200条/13箱 should become one pallet cargo row; its weight is pallet tare plus the sum of those two product total gross weights.
        - Put review-only warnings in "issues" even when the row is also returned in "rows". This includes empty/standalone pallets, mixed or assembled pallets, unclear pallet-to-product alignment, possible duplicated pallet weight, and any mapping that needs user confirmation. Prefix those messages with "复核：" and keep the usable cargo row in "rows".
        - English examples like "2 skids - each 31.200 kgs / 1080 x 200 x 340 cm" mean quantity=2, weightKg=31200, dimensions in cm.
        - Important: in English shipment weights, a dot followed by exactly three digits before kg/kgs is a thousands separator, not a decimal point. Output 29.200 kgs as 29200 kg, never 29.2 kg.
        - For PL / packing-list tables with columns like Size, T.CTNS, PCS/CTN, Order Qty, N.W, G.W, CARTON SIZE(CM), PALLET SIZE(M), T.CBM:
          extract the carton packing unit, not loose product pieces and not pallet summary totals.
          Use Size as name/model text when no product name exists.
          Use T.CTNS / total cartons / 总箱数 as quantity.
          Use CARTON SIZE(CM) / 纸箱尺寸 as lengthCm,widthCm,heightCm.
          Use per-carton G.W / 单箱毛重 as weightKg. If only total gross weight exists, divide it by T.CTNS.
          PCS/CTN and Order Qty are loose-piece/product counts; keep them only in remark and never use Order Qty as quantity.
          PALLET SIZE(M), T.CBM, "12 pallets" totals, and pallet gross totals are summary/reference fields only unless the text is explicitly a final pallet-by-pallet list.
        - Do not calculate loose pieces / 散件 for container packing. Import the actual handled package unit: carton, crate, wooden case, or explicit final pallet unit.
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

  private int applyThousandSeparatedWeightCorrections(List<Map<String, Object>> cargos, String rawText) {
    Map<Long, Double> corrections = thousandSeparatedWeightCorrections(rawText);
    if (corrections.isEmpty()) return 0;

    int count = 0;
    for (Map<String, Object> cargo : cargos) {
      double weightKg = numberValue(cargo.get("weightKg"));
      Double corrected = corrections.get(weightKey(weightKg));
      if (corrected != null && corrected > weightKg + 0.001) {
        cargo.put("weightKg", round2(corrected));
        count++;
      }
    }
    return count;
  }

  private Map<Long, Double> thousandSeparatedWeightCorrections(String rawText) {
    Map<Long, Double> corrections = new LinkedHashMap<>();
    Matcher matcher = THOUSAND_KG_PATTERN.matcher(String.valueOf(rawText == null ? "" : rawText));
    while (matcher.find()) {
      String token = matcher.group(1);
      Double decimalValue = decimalInterpretation(token);
      if (decimalValue == null) continue;
      corrections.put(weightKey(decimalValue), parseFlexibleNumber(token));
    }
    return corrections;
  }

  private Double decimalInterpretation(String token) {
    String text = cleanCell(token).replace(" ", "");
    if (text.isBlank()) return null;
    if (text.indexOf('.') != text.lastIndexOf('.')) return null;
    try {
      return Double.parseDouble(text);
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private long weightKey(double value) {
    return Math.round(value * 1000);
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

  private record DimensionParts(
      double lengthCm,
      double widthCm,
      double heightCm
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
