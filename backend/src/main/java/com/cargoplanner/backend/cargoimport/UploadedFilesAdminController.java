package com.cargoplanner.backend.cargoimport;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/uploaded-files")
public class UploadedFilesAdminController {
  private final UploadStorageService uploadStorageService;

  public UploadedFilesAdminController(UploadStorageService uploadStorageService) {
    this.uploadStorageService = uploadStorageService;
  }

  @GetMapping
  public Map<String, Object> files() {
    return uploadStorageService.listFiles();
  }

  @GetMapping("/summary")
  public Map<String, Object> summary() {
    return uploadStorageService.summary();
  }

  @DeleteMapping
  public Map<String, Object> delete(@RequestBody DeleteUploadedFilesRequest request) {
    return uploadStorageService.deleteFiles(request == null ? List.of() : request.ids());
  }

  public record DeleteUploadedFilesRequest(List<String> ids) {}
}
