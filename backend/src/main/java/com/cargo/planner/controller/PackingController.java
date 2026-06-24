package com.cargo.planner.controller;

import com.cargo.planner.dto.ContainerSpec;
import com.cargo.planner.dto.PackingJobResponse;
import com.cargo.planner.dto.PackingRequest;
import com.cargo.planner.service.PackingJobService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PackingController {
  private final PackingJobService packingJobService;

  public PackingController(PackingJobService packingJobService) {
    this.packingJobService = packingJobService;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "ok");
  }

  @GetMapping("/containers/defaults")
  public List<ContainerSpec> defaultContainers() {
    return List.of(
        new ContainerSpec("20gp", "20GP Standard", 590.0, 235.0, 239.0, 28200.0),
        new ContainerSpec("20hq", "20HQ High Cube", 590.0, 235.0, 270.0, 27800.0),
        new ContainerSpec("40gp", "40GP Standard", 1203.0, 235.0, 239.0, 26700.0),
        new ContainerSpec("40hq", "40HQ High Cube", 1203.0, 235.0, 270.0, 26500.0),
        new ContainerSpec("45hq", "45HQ High Cube", 1356.0, 235.0, 270.0, 28600.0),
        new ContainerSpec("20rf", "20RF Reefer", 545.0, 229.0, 226.0, 27000.0),
        new ContainerSpec("40rf", "40RF Reefer High Cube", 1156.0, 229.0, 250.0, 29000.0)
    );
  }

  @PostMapping("/packing/jobs")
  public PackingJobResponse createJob(@Valid @RequestBody PackingRequest request) {
    return packingJobService.createJob(request);
  }

  @GetMapping("/packing/jobs/{id}")
  public PackingJobResponse getJob(@PathVariable String id) {
    return packingJobService.getJob(id);
  }

  @PostMapping("/packing/calculate")
  public ResponseEntity<PackingJobResponse> calculate(@Valid @RequestBody PackingRequest request) {
    PackingJobResponse job = packingJobService.createJob(request);
    return ResponseEntity.accepted().body(job);
  }
}
