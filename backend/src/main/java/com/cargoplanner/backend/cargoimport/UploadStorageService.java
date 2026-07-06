package com.cargoplanner.backend.cargoimport;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.common.ApiException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class UploadStorageService {
  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
  private static final DateTimeFormatter DATE_FOLDER = DateTimeFormatter.BASIC_ISO_DATE;

  private final ObjectMapper objectMapper;
  private final Path root;

  public UploadStorageService(
      ObjectMapper objectMapper,
      @Value("${app.upload-dir:uploads/imports}") String uploadDir
  ) {
    this.objectMapper = objectMapper;
    this.root = Paths.get(uploadDir).toAbsolutePath().normalize();
  }

  public StoredUpload store(MultipartFile file, AuthenticatedUser user) {
    if (file == null || file.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Upload file is required");
    }
    String originalFileName = safeOriginalName(file.getOriginalFilename());
    String extension = extension(originalFileName);
    if (!List.of(".xlsx", ".xls", ".csv", ".tsv").contains(extension)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only Excel, CSV, or TSV files are supported");
    }

    String id = UUID.randomUUID().toString().replace("-", "");
    Path folder = root.resolve(LocalDate.now().format(DATE_FOLDER)).normalize();
    Path filePath = folder.resolve(id + extension).normalize();
    Path metaPath = folder.resolve(id + ".meta.json").normalize();
    ensureInsideRoot(filePath);
    ensureInsideRoot(metaPath);

    try {
      Files.createDirectories(folder);
      try (InputStream input = file.getInputStream()) {
        Files.copy(input, filePath, StandardCopyOption.REPLACE_EXISTING);
      }
      Map<String, Object> meta = new LinkedHashMap<>();
      meta.put("id", id);
      meta.put("originalFileName", originalFileName);
      meta.put("storedFileName", filePath.getFileName().toString());
      meta.put("relativePath", normalizeRelativePath(root.relativize(filePath)));
      meta.put("contentType", file.getContentType());
      meta.put("sizeBytes", Files.size(filePath));
      meta.put("uploadedByUserId", user == null ? null : user.id());
      meta.put("uploadedByUsername", user == null ? null : user.username());
      meta.put("uploadedAt", Instant.now().toString());
      meta.put("parseStatus", "PENDING");
      meta.put("rowCount", 0);
      meta.put("validCount", 0);
      meta.put("issueCount", 0);
      meta.put("cleanedCount", 0);
      writeMeta(metaPath, meta);
      return new StoredUpload(id, originalFileName, filePath, metaPath);
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store upload file");
    }
  }

  public void markParsed(String id, Map<String, Object> parseResult) {
    updateMeta(id, (meta) -> {
      Map<String, Object> preview = mapValue(parseResult.get("preview"));
      meta.put("parseStatus", "SUCCEEDED");
      meta.put("rowCount", intValue(preview.get("totalRows")));
      meta.put("validCount", intValue(preview.get("validRowCount")));
      meta.put("issueCount", intValue(preview.get("invalidRowCount")));
      meta.put("cleanedCount", listValue(preview.get("aggregated")).size());
      meta.put("errorMessage", null);
      meta.put("parsedAt", Instant.now().toString());
    });
  }

  public void markFailed(String id, String message) {
    updateMeta(id, (meta) -> {
      meta.put("parseStatus", "FAILED");
      meta.put("errorMessage", trim(message, 1000));
      meta.put("parsedAt", Instant.now().toString());
    });
  }

  public Map<String, Object> listFiles() {
    List<Map<String, Object>> files = readAllMeta();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("summary", summaryFor(files));
    result.put("files", files);
    return result;
  }

  public Map<String, Object> summary() {
    return summaryFor(readAllMeta());
  }

  public Map<String, Object> deleteFiles(List<String> ids) {
    List<String> requestedIds = ids == null ? List.of() : ids.stream()
        .map((id) -> id == null ? "" : id.trim())
        .filter((id) -> !id.isBlank())
        .distinct()
        .toList();
    Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
    for (Map<String, Object> meta : readAllMeta()) {
      byId.put(String.valueOf(meta.get("id")), meta);
    }

    long freedBytes = 0;
    int deletedCount = 0;
    List<String> missingIds = new ArrayList<>();
    for (String id : requestedIds) {
      Map<String, Object> meta = byId.get(id);
      if (meta == null) {
        missingIds.add(id);
        continue;
      }
      Path filePath = root.resolve(String.valueOf(meta.get("relativePath"))).normalize();
      Path metaPath = filePath.resolveSibling(id + ".meta.json").normalize();
      ensureInsideRoot(filePath);
      ensureInsideRoot(metaPath);
      try {
        freedBytes += Files.exists(filePath) ? Files.size(filePath) : longValue(meta.get("sizeBytes"));
        Files.deleteIfExists(filePath);
        Files.deleteIfExists(metaPath);
        deletedCount += 1;
      } catch (IOException error) {
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to delete uploaded file " + id);
      }
    }

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("deletedCount", deletedCount);
    result.put("freedBytes", freedBytes);
    result.put("missingIds", missingIds);
    result.put("summary", summary());
    return result;
  }

  private List<Map<String, Object>> readAllMeta() {
    if (!Files.exists(root)) return List.of();
    try (Stream<Path> paths = Files.walk(root)) {
      return paths
          .filter((path) -> path.getFileName().toString().endsWith(".meta.json"))
          .map(this::readMetaWithSize)
          .filter((meta) -> !meta.isEmpty())
          .sorted(Comparator.comparing((Map<String, Object> meta) -> String.valueOf(meta.get("uploadedAt"))).reversed())
          .toList();
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to scan uploaded files");
    }
  }

  private Map<String, Object> readMetaWithSize(Path metaPath) {
    try {
      Map<String, Object> meta = objectMapper.readValue(metaPath.toFile(), MAP_TYPE);
      String relativePath = String.valueOf(meta.getOrDefault("relativePath", ""));
      Path filePath = relativePath.isBlank() ? null : root.resolve(relativePath).normalize();
      if (filePath != null) {
        ensureInsideRoot(filePath);
        meta.put("exists", Files.exists(filePath));
        meta.put("sizeBytes", Files.exists(filePath) ? Files.size(filePath) : longValue(meta.get("sizeBytes")));
      }
      return meta;
    } catch (Exception error) {
      return Map.of();
    }
  }

  private Map<String, Object> summaryFor(List<Map<String, Object>> files) {
    long totalSizeBytes = files.stream().mapToLong((meta) -> longValue(meta.get("sizeBytes"))).sum();
    Map<String, Long> byStatus = new LinkedHashMap<>();
    for (Map<String, Object> meta : files) {
      String status = String.valueOf(meta.getOrDefault("parseStatus", "UNKNOWN"));
      byStatus.put(status, byStatus.getOrDefault(status, 0L) + 1L);
    }
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("uploadDir", root.toString());
    summary.put("fileCount", files.size());
    summary.put("totalSizeBytes", totalSizeBytes);
    summary.put("totalSizeMb", Math.round(totalSizeBytes / 1024.0 / 1024.0 * 100.0) / 100.0);
    summary.put("byStatus", byStatus);
    summary.put("latestUploadedAt", files.isEmpty() ? null : files.get(0).get("uploadedAt"));
    summary.put("oldestUploadedAt", files.isEmpty() ? null : files.get(files.size() - 1).get("uploadedAt"));
    return summary;
  }

  private void updateMeta(String id, MetaUpdater updater) {
    Path metaPath = findMetaPath(id);
    if (metaPath == null) return;
    try {
      Map<String, Object> meta = objectMapper.readValue(metaPath.toFile(), MAP_TYPE);
      updater.update(meta);
      writeMeta(metaPath, meta);
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to update upload metadata");
    }
  }

  private Path findMetaPath(String id) {
    if (id == null || !id.matches("[a-fA-F0-9]{32}")) return null;
    if (!Files.exists(root)) return null;
    try (Stream<Path> paths = Files.walk(root)) {
      return paths
          .filter((path) -> path.getFileName().toString().equals(id + ".meta.json"))
          .findFirst()
          .orElse(null);
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to scan upload metadata");
    }
  }

  private void writeMeta(Path metaPath, Map<String, Object> meta) throws IOException {
    Files.createDirectories(metaPath.getParent());
    objectMapper.writerWithDefaultPrettyPrinter().writeValue(metaPath.toFile(), meta);
  }

  private void ensureInsideRoot(Path path) {
    if (!path.toAbsolutePath().normalize().startsWith(root)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid upload path");
    }
  }

  private String safeOriginalName(String name) {
    String fallback = "uploaded-file";
    String value = name == null || name.isBlank() ? fallback : Paths.get(name).getFileName().toString();
    value = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
    return value.isBlank() ? fallback : trim(value, 180);
  }

  private String extension(String fileName) {
    int dot = fileName.lastIndexOf('.');
    return dot >= 0 ? fileName.substring(dot).toLowerCase(Locale.ROOT) : "";
  }

  private String normalizeRelativePath(Path path) {
    return path.toString().replace('\\', '/');
  }

  private Map<String, Object> mapValue(Object value) {
    return value instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : Map.of();
  }

  private List<?> listValue(Object value) {
    return value instanceof List<?> list ? list : List.of();
  }

  private int intValue(Object value) {
    if (value instanceof Number number) return number.intValue();
    try {
      return Integer.parseInt(String.valueOf(value));
    } catch (Exception error) {
      return 0;
    }
  }

  private long longValue(Object value) {
    if (value instanceof Number number) return number.longValue();
    try {
      return Long.parseLong(String.valueOf(value));
    } catch (Exception error) {
      return 0L;
    }
  }

  private String trim(String value, int maxLength) {
    if (value == null) return null;
    return value.length() <= maxLength ? value : value.substring(0, maxLength);
  }

  public record StoredUpload(String id, String originalFileName, Path filePath, Path metaPath) {}

  private interface MetaUpdater {
    void update(Map<String, Object> meta);
  }
}
