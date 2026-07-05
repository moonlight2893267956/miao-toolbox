package com.miao.toolbox.auth.repository;

import com.miao.toolbox.auth.entity.Route;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.Set;

@Repository
public interface RouteRepository extends JpaRepository<Route, Long> {

    Optional<Route> findByCode(String code);

    boolean existsByCode(String code);

    List<Route> findAllByOrderByCategoryAscSortOrderAscIdAsc();

    List<Route> findByIsAdminRouteFalseOrderByCategoryAscSortOrderAscIdAsc();

    @Query(value = """
            SELECT rt.code
            FROM routes rt
            WHERE rt.is_enabled = TRUE
              AND EXISTS (
                  SELECT 1 FROM role_routes rr
                  INNER JOIN user_roles ur ON ur.role_id = rr.role_id
                  WHERE rr.route_id = rt.id AND ur.user_id = :userId
              )
            ORDER BY rt.sort_order ASC, rt.id ASC
            """, nativeQuery = true)
    List<String> findEnabledCodesByUserId(@Param("userId") Long userId);

    @Query(value = """
            SELECT rt.code
            FROM routes rt
            WHERE rt.is_enabled = TRUE
            ORDER BY rt.sort_order ASC, rt.id ASC
            """, nativeQuery = true)
    List<String> findAllEnabledCodes();

    @Query(value = "SELECT rr.route_id FROM role_routes rr WHERE rr.role_id = :roleId", nativeQuery = true)
    Set<Long> findRouteIdsByRoleId(@Param("roleId") Long roleId);
}
