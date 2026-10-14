package com.miao.toolbox.tool.wubi.challenge.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 一次挑战成绩提交（对应表 {@code wubi_challenge_scores}）。
 *
 * <p>只存 {@code userId} 而不建 JPA 关联：榜单查询只取用户名用于展示，
 * 建关联会把 auth 模块拖进查询路径（懒加载 / N+1 / 循环依赖）。
 * Service 拿到 top N 后用 {@code UserRepository.findAllById} 批量补用户名。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "wubi_challenge_scores")
public class WubiChallengeScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ChallengeMode mode;

    /** 得分（口径见前端 challenge.ts：冲刺=正确字数 / 生存=正确题数 / 每日=正确题数） */
    @Column(nullable = false)
    private Integer score;

    /** 正确打出的汉字数（冲刺的主指标） */
    @Column(name = "correct_chars", nullable = false)
    @Builder.Default
    private Integer correctChars = 0;

    /** 准确率百分数（0~100 整数，避免浮点在不同端格式化不一致） */
    @Column(name = "accuracy_percent", nullable = false)
    @Builder.Default
    private Integer accuracyPercent = 0;

    /** 本次用时（秒） */
    @Column(name = "duration_sec", nullable = false)
    @Builder.Default
    private Integer durationSec = 0;

    /** 本次最高连击 */
    @Column(name = "max_combo", nullable = false)
    @Builder.Default
    private Integer maxCombo = 0;

    /** 归属日期（客户端本地时区的 YYYY-MM-DD，日榜按此过滤） */
    @Column(name = "stat_date", nullable = false)
    private LocalDate statDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
