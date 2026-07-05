-- V12: Role-based access control — data migration from binary role to multi-role model
-- Creates roles, user_roles, routes, role_routes tables and migrates existing user data.
-- After this migration, users must re-login (refresh_tokens are cleared).

-- ==========================================
-- 1. Create roles table
-- ==========================================
CREATE TABLE roles (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    code        VARCHAR(50)  NOT NULL,
    name        VARCHAR(20)  NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 2. Create user_roles table (many-to-many)
-- ==========================================
CREATE TABLE user_roles (
    id         BIGINT    NOT NULL AUTO_INCREMENT,
    user_id    BIGINT    NOT NULL,
    role_id    BIGINT    NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_user_roles_user_role (user_id, role_id),
    INDEX idx_user_roles_role_id (role_id),
    CONSTRAINT fk_user_roles_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_roles FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 3. Create routes table
-- ==========================================
CREATE TABLE routes (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    code           VARCHAR(50)  NOT NULL,
    name           VARCHAR(100) NOT NULL,
    path           VARCHAR(255) NOT NULL,
    category       VARCHAR(20)  NOT NULL,
    icon           VARCHAR(50)  DEFAULT NULL,
    sort_order     INT          NOT NULL DEFAULT 0,
    is_admin_route BOOLEAN      NOT NULL DEFAULT FALSE,
    is_enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_routes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 4. Create role_routes table (many-to-many)
-- ==========================================
CREATE TABLE role_routes (
    id         BIGINT    NOT NULL AUTO_INCREMENT,
    role_id    BIGINT    NOT NULL,
    route_id   BIGINT    NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE INDEX idx_role_routes_role_route (role_id, route_id),
    INDEX idx_role_routes_route_id (route_id),
    CONSTRAINT fk_role_routes_roles FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_role_routes_routes FOREIGN KEY (route_id) REFERENCES routes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 5. Insert built-in system roles
-- ==========================================
INSERT INTO roles (code, name, description, is_system) VALUES
('SUPER_ADMIN', '超级管理员', '系统内置超级管理员，隐式拥有所有路由访问权限', TRUE),
('USER',        '普通用户',   '系统内置普通用户，拥有基础工具访问权限',       TRUE);

-- ==========================================
-- 6. Insert initial non-admin routes
-- ==========================================
INSERT INTO routes (code, name, path, category, icon, sort_order, is_admin_route, is_enabled) VALUES
('TOOL_TEXT_COMPARE',  '文本对照',   '/tools/text-compare',   'tool', 'DiffOutlined',    1, FALSE, TRUE),
('TOOL_CRYPTO',        '加解密工具', '/tools/crypto',         'tool', 'LockOutlined',    2, FALSE, TRUE),
('TOOL_JSON_WORKBENCH','JSON工作台', '/tools/json-workbench', 'tool', 'CodeOutlined',    3, FALSE, TRUE),
('PAGE_SETTINGS',      '设置',       '/settings',             'page', 'SettingOutlined', 4, FALSE, TRUE);

-- ==========================================
-- 7. Migrate ADMIN users → SUPER_ADMIN role
-- ==========================================
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, (SELECT r.id FROM roles r WHERE r.code = 'SUPER_ADMIN')
FROM users u
WHERE u.role = 'ADMIN';

-- ==========================================
-- 8. Migrate USER users → USER role
-- ==========================================
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, (SELECT r.id FROM roles r WHERE r.code = 'USER')
FROM users u
WHERE u.role = 'USER';

-- ==========================================
-- 9. Grant USER role access to all non-admin routes
--    SUPER_ADMIN implicitly has all routes (handled in application code)
-- ==========================================
INSERT INTO role_routes (role_id, route_id)
SELECT r.id, rt.id
FROM roles r CROSS JOIN routes rt
WHERE r.code = 'USER'
  AND rt.is_admin_route = FALSE;

-- ==========================================
-- 10. Clear all refresh_tokens to force re-login
--     (JWT claims structure changes from role:String to roles:List)
-- ==========================================
DELETE FROM refresh_tokens;

-- ==========================================
-- 11. Drop the old role ENUM column from users table
-- ==========================================
ALTER TABLE users DROP COLUMN role;
