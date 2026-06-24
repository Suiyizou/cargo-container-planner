package com.cargo.planner.service;

import com.cargo.planner.dto.PackingJobResponse;
import com.cargo.planner.dto.PackingRequest;
import com.cargo.planner.dto.PackingResultDto;
import com.cargo.planner.entity.PackingJobEntity;
import com.cargo.planner.repository.PackingJobRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PackingJobService {
  private static final Logger log = LoggerFactory.getLogger(PackingJobService.class);
  private static final String STATUS_PENDING = "pending";
  private static final String STATUS_RUNNING = "running";
  private static final String STATUS_FINISHED = "finished";
  private static final String STATUS_FAILED = "failed";

  private final PackingJobRepository repository;
  private final PackingCalculator calculator;
  private final ObjectMapper objectMapper;
  private final StringRedisTemplate redisTemplate;
  private final TaskExecutor packingTaskExecutor;
  private final TransactionTemplate transactionTemplate;
  private final Duration cacheTtl;

  public PackingJobService(
      PackingJobRepository repository,
      PackingCalculator calculator,
      ObjectMapper objectMapper,
      StringRedisTemplate redisTemplate,
      TaskExecutor packingTaskExecutor,
      TransactionTemplate transactionTemplate,
      @Value("${planner.cache-ttl-seconds:86400}") long cacheTtlSeconds
  ) {
    this.repository = repository;
    this.calculator = calculator;
    this.objectMapper = objectMapper;
    this.redisTemplate = redisTemplate;
    this.packingTaskExecutor = packingTaskExecutor;
    this.transactionTemplate = transactionTemplate;
    this.cacheTtl = Duration.ofSeconds(cacheTtlSeconds);
  }

  @Transactional
  public PackingJobResponse createJob(PackingRequest request) {
    String requestJson = writeJson(request);
    String requestHash = sha256(requestJson);
    String jobId = UUID.randomUUID().toString();
    Instant now = Instant.now();

    PackingJobEntity job = new PackingJobEntity();
    job.setId(jobId);
    job.setStatus(STATUS_PENDING);
    job.setProgress(0);
    job.setRequestHash(requestHash);
    job.setRequestJson(requestJson);
    job.setMessage("Job accepted");
    job.setCreatedAt(now);
    job.setUpdatedAt(now);

    String cachedResult = readCache(requestHash);
    if (cachedResult != null) {
      job.setStatus(STATUS_FINISHED);
      job.setProgress(100);
      job.setResultJson(cachedResult);
      job.setMessage("Finished from Redis cache");
      repository.save(job);
      return toResponse(job);
    }

    repository.saveAndFlush(job);
    scheduleRunJob(jobId, request, requestHash);
    return toResponse(job);
  }

  @Transactional(readOnly = true)
  public PackingJobResponse getJob(String id) {
    return repository.findById(id)
        .map(this::toResponse)
        .orElseThrow(() -> new IllegalArgumentException("Packing job not found: " + id));
  }

  private void runJob(String jobId, PackingRequest request, String requestHash) {
    try {
      updateJob(jobId, STATUS_RUNNING, 10, "Calculating packing plan", null);
      PackingResultDto result = calculator.calculate(request);
      String resultJson = writeJson(result);
      writeCache(requestHash, resultJson);
      updateJob(jobId, STATUS_FINISHED, 100, "Calculation finished", resultJson);
    } catch (Exception ex) {
      try {
        updateJob(jobId, STATUS_FAILED, 100, "Calculation failed: " + ex.getMessage(), null);
      } catch (Exception updateEx) {
        log.error("Failed to mark packing job {} as failed", jobId, updateEx);
      }
    }
  }

  private void scheduleRunJob(String jobId, PackingRequest request, String requestHash) {
    Runnable enqueue = () -> packingTaskExecutor.execute(() -> runJob(jobId, request, requestHash));
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      enqueue.run();
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
      @Override
      public void afterCommit() {
        enqueue.run();
      }
    });
  }

  private void updateJob(String jobId, String status, int progress, String message, String resultJson) {
    transactionTemplate.executeWithoutResult(transactionStatus -> {
      PackingJobEntity job = repository.findById(jobId)
          .orElseThrow(() -> new IllegalStateException("Packing job not found: " + jobId));
      job.setStatus(status);
      job.setProgress(progress);
      job.setMessage(message);
      if (resultJson != null) job.setResultJson(resultJson);
      job.setUpdatedAt(Instant.now());
      repository.save(job);
    });
  }

  private PackingJobResponse toResponse(PackingJobEntity job) {
    PackingResultDto result = null;
    if (job.getResultJson() != null && !job.getResultJson().isBlank()) {
      try {
        result = objectMapper.readValue(job.getResultJson(), PackingResultDto.class);
      } catch (JsonProcessingException ex) {
        throw new IllegalStateException("Stored packing result cannot be parsed", ex);
      }
    }
    return new PackingJobResponse(
        job.getId(),
        job.getStatus(),
        job.getProgress(),
        job.getMessage(),
        result,
        job.getCreatedAt(),
        job.getUpdatedAt()
    );
  }

  private String writeJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      throw new IllegalArgumentException("Request cannot be serialized", ex);
    }
  }

  private String readCache(String requestHash) {
    try {
      return redisTemplate.opsForValue().get(cacheKey(requestHash));
    } catch (Exception ignored) {
      return null;
    }
  }

  private void writeCache(String requestHash, String resultJson) {
    try {
      redisTemplate.opsForValue().set(cacheKey(requestHash), resultJson, cacheTtl);
    } catch (Exception ignored) {
      // Redis is an acceleration layer; the database remains the source of record.
    }
  }

  private String cacheKey(String requestHash) {
    return "packing:result:" + requestHash;
  }

  private String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 is unavailable", ex);
    }
  }
}
