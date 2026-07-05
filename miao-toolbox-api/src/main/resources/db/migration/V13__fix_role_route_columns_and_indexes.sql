-- V13: Fix column sizes and add missing indexes to align with architecture spec.
-- Adjusts V12 columns that differed from the architecture document.

-- ==========================================
-- 1. Fix roles.description: 255 → 100 (PRD FR-1: max 100 chars)
-- ==========================================
ALTER TABLE roles MODIFY COLUMN description VARCHAR(100) DEFAULT NULL;

-- ==========================================
-- 2. Fix routes.code: 50 → 64 (architecture: VARCHAR(64))
-- ==========================================
ALTER TABLE routes MODIFY COLUMN code VARCHAR(64) NOT NULL;

-- ==========================================
-- 3. Fix routes.name: 100 → 40 (architecture: VARCHAR(40))
-- ==========================================
ALTER TABLE routes MODIFY COLUMN name VARCHAR(40) NOT NULL;

-- ==========================================
-- 4. Add role name unique index (PRD FR-1: 同租户唯一)
-- ==========================================
ALTER TABLE roles ADD UNIQUE INDEX idx_roles_name (name);

-- ==========================================
-- 5. Add route query indexes (architecture spec)
-- ==========================================
ALTER TABLE routes ADD INDEX idx_routes_category (category);
ALTER TABLE routes ADD INDEX idx_routes_is_admin_route (is_admin_route);
