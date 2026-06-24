package com.cargo.planner.repository;

import com.cargo.planner.entity.PackingJobEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PackingJobRepository extends JpaRepository<PackingJobEntity, String> {
}
