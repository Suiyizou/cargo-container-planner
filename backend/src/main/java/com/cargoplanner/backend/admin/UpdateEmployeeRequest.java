package com.cargoplanner.backend.admin;

public record UpdateEmployeeRequest(
    String displayName,
    String role,
    String status,
    String password
) {}
