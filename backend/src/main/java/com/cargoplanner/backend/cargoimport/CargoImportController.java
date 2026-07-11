package com.cargoplanner.backend.cargoimport;

import com.cargoplanner.backend.common.ApiException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/cargo-imports")
public class CargoImportController {
  private final CargoImportParseService parseService;

  public CargoImportController(CargoImportParseService parseService) {
    this.parseService = parseService;
  }

  @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> preview(
      @RequestParam("file") MultipartFile file
  ) {
    if (file == null || file.isEmpty()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Upload file is required");
    }
    String originalFileName = file.getOriginalFilename() == null ? "uploaded-file" : file.getOriginalFilename();
    String suffix = (originalFileName.contains(".")
        ? originalFileName.substring(originalFileName.lastIndexOf('.'))
        : "").toLowerCase();
    if (!suffix.matches("\\.(xlsx|xls|csv|tsv)")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Only Excel, CSV, or TSV files are supported");
    }
    Path temporaryFile = null;
    try {
      temporaryFile = Files.createTempFile("cargo-import-", suffix);
      file.transferTo(temporaryFile);
      return parseService.parse(temporaryFile, originalFileName);
    } catch (IOException error) {
      throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to process upload file");
    } finally {
      if (temporaryFile != null) {
        try {
          Files.deleteIfExists(temporaryFile);
        } catch (IOException ignored) {
          // The operating system will eventually clear its temp directory.
        }
      }
    }
  }
}
