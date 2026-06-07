-- V7: Add Google OAuth columns to users table
ALTER TABLE users
    ADD COLUMN google_id VARCHAR(255) DEFAULT NULL AFTER github_username,
    ADD COLUMN google_username VARCHAR(255) DEFAULT NULL AFTER google_id;

CREATE UNIQUE INDEX idx_users_google_id ON users (google_id);
