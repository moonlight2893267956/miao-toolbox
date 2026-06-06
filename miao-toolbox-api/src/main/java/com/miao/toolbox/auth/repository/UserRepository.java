package com.miao.toolbox.auth.repository;

import com.miao.toolbox.auth.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findByGithubId(String githubId);

    Optional<User> findByEmail(String email);

    boolean existsByUsername(String username);
}
