package com.miao.toolbox.invite.repository;

import com.miao.toolbox.invite.entity.InviteToken;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface InviteTokenRepository extends JpaRepository<InviteToken, Long> {

    Optional<InviteToken> findByTokenHash(String tokenHash);
}
