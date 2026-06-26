package com.cargoplanner.backend.auth;

public record AuthenticatedUser(
    long id,
    String username,
    String displayName,
    String role,
    String status
) {
  public boolean isAdmin() {
    return "ADMIN".equals(role);
  }
}
