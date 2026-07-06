package com.cargoplanner.backend.cargoimport;

import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.UserAuthInterceptor;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/cargo-imports")
public class CargoImportController {
  private final CargoImportParseService parseService;
  private final UploadStorageService uploadStorageService;

  public CargoImportController(CargoImportParseService parseService, UploadStorageService uploadStorageService) {
    this.parseService = parseService;
    this.uploadStorageService = uploadStorageService;
  }

  @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> preview(
      @RequestParam("file") MultipartFile file,
      @RequestAttribute(UserAuthInterceptor.CURRENT_USER_ATTRIBUTE) AuthenticatedUser user
  ) {
    UploadStorageService.StoredUpload upload = uploadStorageService.store(file, user);
    try {
      Map<String, Object> result = parseService.parse(upload.filePath(), upload.originalFileName());
      uploadStorageService.markParsed(upload.id(), result);
      Map<String, Object> uploadMeta = new LinkedHashMap<>();
      uploadMeta.put("id", upload.id());
      uploadMeta.put("originalFileName", upload.originalFileName());
      result.put("upload", uploadMeta);
      return result;
    } catch (RuntimeException error) {
      uploadStorageService.markFailed(upload.id(), error.getMessage());
      throw error;
    }
  }
}
