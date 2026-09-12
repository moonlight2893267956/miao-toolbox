package com.miao.toolbox.tool.scheduler.repository;

import com.miao.toolbox.tool.scheduler.entity.ScriptVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ScriptVersionRepository extends JpaRepository<ScriptVersion, Long> {

    List<ScriptVersion> findByScriptIdOrderByVersionDesc(Long scriptId);

    Optional<ScriptVersion> findByScriptIdAndVersion(Long scriptId, Integer version);

    /** 版本数量（删除版本时判断「至少保留一个版本」） */
    long countByScriptId(Long scriptId);
}
