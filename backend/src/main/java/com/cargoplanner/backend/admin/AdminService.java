package com.cargoplanner.backend.admin;

import com.cargoplanner.backend.auth.AuthService;
import com.cargoplanner.backend.auth.AuthenticatedUser;
import com.cargoplanner.backend.auth.PasswordHasher;
import com.cargoplanner.backend.common.ApiException;
import com.cargoplanner.backend.common.ClientInfo;
import com.cargoplanner.backend.common.RequestStats;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminService {
  private final JdbcTemplate jdbcTemplate;
  private final PasswordHasher passwordHasher;
  private final RequestStats requestStats;
  private final AuthService authService;

  public AdminService(
      JdbcTemplate jdbcTemplate,
      PasswordHasher passwordHasher,
      RequestStats requestStats,
      AuthService authService
  ) {
    this.jdbcTemplate = jdbcTemplate;
    this.passwordHasher = passwordHasher;
    this.requestStats = requestStats;
    this.authService = authService;
  }

  public List<Map<String, Object>> listEmployees() {
    return jdbcTemplate.query(
        """
        SELECT id, username, display_name, role, status, created_at, updated_at, last_login_at
        FROM cp_users
        ORDER BY role = 'ADMIN' DESC, id ASC
        """,
        this::mapUserRow
    );
  }

  @Transactional
  public Map<String, Object> createEmployee(CreateEmployeeRequest request, AuthenticatedUser admin, String ip) {
    PasswordHasher.PasswordHash passwordHash = passwordHasher.hash(request.password());
    String role = normalizeRole(request.role(), "EMPLOYEE");
    try {
      jdbcTemplate.update(
          """
          INSERT INTO cp_users (
            username, display_name, role, status, password_salt, password_hash, password_iterations, created_by
          )
          VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
          """,
          request.username().trim(),
          request.displayName().trim(),
          role,
          passwordHash.salt(),
          passwordHash.hash(),
          passwordHash.iterations(),
          admin.id()
      );
    } catch (DuplicateKeyException error) {
      throw new ApiException(HttpStatus.CONFLICT, "Username already exists");
    }
    Long userId = jdbcTemplate.queryForObject("SELECT id FROM cp_users WHERE username = ?", Long.class, request.username().trim());
    audit(admin.id(), "CREATE_USER", "USER", userId, "Created user " + request.username().trim(), ip);
    return findUser(userId);
  }

  @Transactional
  public Map<String, Object> updateEmployee(long userId, UpdateEmployeeRequest request, AuthenticatedUser admin, String ip) {
    Map<String, Object> existing = findUser(userId);
    String displayName = valueOrExisting(request.displayName(), (String) existing.get("displayName"));
    String role = normalizeRole(request.role(), (String) existing.get("role"));
    String status = normalizeStatus(request.status(), (String) existing.get("status"));

    if (request.password() != null && !request.password().isBlank()) {
      if (request.password().length() < 8) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "Password must contain at least 8 characters");
      }
      PasswordHasher.PasswordHash passwordHash = passwordHasher.hash(request.password());
      jdbcTemplate.update(
          """
          UPDATE cp_users
          SET display_name = ?, role = ?, status = ?, password_salt = ?, password_hash = ?, password_iterations = ?
          WHERE id = ?
          """,
          displayName,
          role,
          status,
          passwordHash.salt(),
          passwordHash.hash(),
          passwordHash.iterations(),
          userId
      );
    } else {
      jdbcTemplate.update(
          "UPDATE cp_users SET display_name = ?, role = ?, status = ? WHERE id = ?",
          displayName,
          role,
          status,
          userId
      );
    }

    if ("DISABLED".equals(status)) {
      jdbcTemplate.update(
          "UPDATE cp_login_devices SET online = 0, session_token_hash = NULL, revoked_at = ? WHERE user_id = ?",
          Timestamp.from(Instant.now()),
          userId
      );
    }
    audit(admin.id(), "UPDATE_USER", "USER", userId, "Updated user " + existing.get("username"), ip);
    return findUser(userId);
  }

  public List<Map<String, Object>> listDevices() {
    return jdbcTemplate.query(
        """
        SELECT d.id, d.user_id, u.username, u.display_name, d.device_id, d.device_name, d.mac_address,
               d.ip_address, d.user_agent, d.online, d.logged_in_at, d.last_seen_at, d.revoked_at
        FROM cp_login_devices d
        JOIN cp_users u ON u.id = d.user_id
        ORDER BY d.online DESC, d.last_seen_at DESC, d.id DESC
        LIMIT 200
        """,
        this::mapDeviceRow
    );
  }

  @Transactional
  public Map<String, Object> kickDevice(long deviceRowId, AuthenticatedUser admin, String ip) {
    Map<String, Object> device = findDevice(deviceRowId);
    jdbcTemplate.update(
        "UPDATE cp_login_devices SET online = 0, session_token_hash = NULL, revoked_at = ? WHERE id = ?",
        Timestamp.from(Instant.now()),
        deviceRowId
    );
    authService.recordEvent(
        ((Number) device.get("userId")).longValue(),
        (String) device.get("username"),
        "KICK",
        (String) device.get("deviceId"),
        ip,
        null,
        "Kicked by admin " + admin.username()
    );
    audit(admin.id(), "KICK_DEVICE", "DEVICE", deviceRowId, "Kicked device " + device.get("deviceId"), ip);
    return findDevice(deviceRowId);
  }

  public Map<String, Object> monitoring() {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("serverTime", Instant.now().toString());
    result.put("userCount", count("SELECT COUNT(*) FROM cp_users"));
    result.put("adminCount", count("SELECT COUNT(*) FROM cp_users WHERE role = 'ADMIN'"));
    result.put("onlineDeviceCount", count("SELECT COUNT(*) FROM cp_login_devices WHERE online = 1 AND revoked_at IS NULL"));
    result.put("loginSuccessToday", count("SELECT COUNT(*) FROM cp_login_events WHERE event_type = 'LOGIN_SUCCESS' AND created_at >= CURDATE()"));
    result.put("loginFailToday", count("SELECT COUNT(*) FROM cp_login_events WHERE event_type IN ('LOGIN_FAIL', 'DEVICE_LIMIT') AND created_at >= CURDATE()"));
    result.put("deviceLimit", authService.deviceLimit());
    result.put("runtime", requestStats.snapshot());
    result.put("recentEvents", recentEvents());
    return result;
  }

  private Map<String, Object> findUser(Long userId) {
    List<Map<String, Object>> users = jdbcTemplate.query(
        """
        SELECT id, username, display_name, role, status, created_at, updated_at, last_login_at
        FROM cp_users
        WHERE id = ?
        """,
        this::mapUserRow,
        userId
    );
    if (users.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "User not found");
    }
    return users.get(0);
  }

  private Map<String, Object> findDevice(long deviceRowId) {
    List<Map<String, Object>> devices = jdbcTemplate.query(
        """
        SELECT d.id, d.user_id, u.username, u.display_name, d.device_id, d.device_name, d.mac_address,
               d.ip_address, d.user_agent, d.online, d.logged_in_at, d.last_seen_at, d.revoked_at
        FROM cp_login_devices d
        JOIN cp_users u ON u.id = d.user_id
        WHERE d.id = ?
        """,
        this::mapDeviceRow,
        deviceRowId
    );
    if (devices.isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Device not found");
    }
    return devices.get(0);
  }

  private List<Map<String, Object>> recentEvents() {
    return jdbcTemplate.query(
        """
        SELECT id, user_id, username, event_type, device_id, ip_address, message, created_at
        FROM cp_login_events
        ORDER BY created_at DESC, id DESC
        LIMIT 20
        """,
        (rs, rowNum) -> {
          Map<String, Object> row = new LinkedHashMap<>();
          row.put("id", rs.getLong("id"));
          row.put("userId", nullableLong(rs, "user_id"));
          row.put("username", rs.getString("username"));
          row.put("eventType", rs.getString("event_type"));
          row.put("deviceId", rs.getString("device_id"));
          row.put("ipAddress", rs.getString("ip_address"));
          row.put("message", rs.getString("message"));
          row.put("createdAt", stringTimestamp(rs, "created_at"));
          return row;
        }
    );
  }

  private void audit(Long adminId, String action, String targetType, Long targetId, String detail, String ip) {
    jdbcTemplate.update(
        """
        INSERT INTO cp_admin_audit_log (admin_user_id, action, target_type, target_id, detail, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        adminId,
        action,
        targetType,
        targetId,
        ClientInfo.trim(detail, 512),
        ClientInfo.trim(ip, 64)
    );
  }

  private long count(String sql) {
    Long value = jdbcTemplate.queryForObject(sql, Long.class);
    return value == null ? 0 : value;
  }

  private String normalizeRole(String role, String fallback) {
    String value = role == null || role.isBlank() ? fallback : role.trim().toUpperCase();
    if (!"ADMIN".equals(value) && !"EMPLOYEE".equals(value)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Role must be ADMIN or EMPLOYEE");
    }
    return value;
  }

  private String normalizeStatus(String status, String fallback) {
    String value = status == null || status.isBlank() ? fallback : status.trim().toUpperCase();
    if (!"ACTIVE".equals(value) && !"DISABLED".equals(value)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be ACTIVE or DISABLED");
    }
    return value;
  }

  private String valueOrExisting(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : ClientInfo.trim(value, 80);
  }

  private Map<String, Object> mapUserRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("username", rs.getString("username"));
    row.put("displayName", rs.getString("display_name"));
    row.put("role", rs.getString("role"));
    row.put("status", rs.getString("status"));
    row.put("createdAt", stringTimestamp(rs, "created_at"));
    row.put("updatedAt", stringTimestamp(rs, "updated_at"));
    row.put("lastLoginAt", stringTimestamp(rs, "last_login_at"));
    return row;
  }

  private Map<String, Object> mapDeviceRow(ResultSet rs, int rowNum) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", rs.getLong("id"));
    row.put("userId", rs.getLong("user_id"));
    row.put("username", rs.getString("username"));
    row.put("displayName", rs.getString("display_name"));
    row.put("deviceId", rs.getString("device_id"));
    row.put("deviceName", rs.getString("device_name"));
    row.put("macAddress", rs.getString("mac_address"));
    row.put("ipAddress", rs.getString("ip_address"));
    row.put("userAgent", rs.getString("user_agent"));
    row.put("online", rs.getBoolean("online"));
    row.put("loggedInAt", stringTimestamp(rs, "logged_in_at"));
    row.put("lastSeenAt", stringTimestamp(rs, "last_seen_at"));
    row.put("revokedAt", stringTimestamp(rs, "revoked_at"));
    return row;
  }

  private Long nullableLong(ResultSet rs, String column) throws SQLException {
    long value = rs.getLong(column);
    return rs.wasNull() ? null : value;
  }

  private String stringTimestamp(ResultSet rs, String column) throws SQLException {
    Timestamp timestamp = rs.getTimestamp(column);
    return timestamp == null ? null : timestamp.toInstant().toString();
  }
}
