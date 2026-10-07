/**
 * 练习 Tab
 *
 * 六种练习模式：键位热身、字根定位、字根序列、单字拆分、简码专项、词组输入。
 * 会话引擎由 usePracticeSession 驱动。
 */

import React, {
  useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef,
} from 'react';
import {
  ThunderboltOutlined,
  AppstoreOutlined,
  OrderedListOutlined,
  FontSizeOutlined,
  RocketOutlined,
  BlockOutlined,
  FileTextOutlined,
  EditOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import PracticeBoard from '../components/PracticeBoard';
import ArticleBoard from '../components/ArticleBoard';
import CourseMap from '../components/CourseMap';
import ResultPanel from '../components/ResultPanel';
import DailyPlanCard from '../components/DailyPlanCard';
import AchievementToast from '../components/AchievementToast';
import { usePracticeSession } from '../utils/wubi/usePracticeSession';
import {
  buildSnapshot,
  serializeSnapshot,
  parseSnapshot,
  type PracticeSnapshot,
} from '../utils/wubi/sessionSnapshot';
import { formatTime } from '../utils/wubi/metrics';
import { useWubiData, bucketsForPhraseLength } from '../utils/wubi/useWubiData';
import { useWubiStorage } from '../utils/wubi/useWubiStorage';
import { useCourseProgress } from '../utils/wubi/useCourseProgress';
import { useWubiStats } from '../utils/wubi/useWubiStats';
import { useReview } from '../utils/wubi/useReview';
import { PASS_MIN_CHARS, evaluateLesson, getNextLesson } from '../utils/wubi/course';
import { analyzeErrors, type ErrorSummary } from '../utils/wubi/errorAnalysis';
import { buildDailyPlan, type DailyPlanTaskId } from '../utils/wubi/dailyPlan';
import { todayKey } from '../utils/wubi/statsAggregation';
import {
  compareWithLast,
  toSummary,
  lessonModeKey,
  type ModeComparison,
} from '../utils/wubi/sessionStats';
import {
  createKeyDrillSource,
  createRadicalIdentifySource,
  createRadicalSequenceSource,
  createCharCodeSource,
  createSimplifiedCodeSource,
  createPhraseCodeSource,
  createArticleSource,
  createRadicalCodeSource,
  getLessonCharPool,
  type QuestionSource,
} from '../utils/wubi/questionSource';
import { validateCustomText } from '../utils/wubi/articleTokenizer';
import { ARTICLES, DIFFICULTY_LABELS, estimateMinutes, type Article } from '../data/articles';
import {
  getLearnedKeys,
  type Lesson,
  type LessonStage,
} from '../data/lessons';
import type { SessionResult } from '../utils/wubi/session';
import { ZONE_LABELS, type WubiZone } from '../data/radicals';

/** 五个分区（用于键位热身的分区筛选） */
const ZONES = Object.keys(ZONE_LABELS) as WubiZone[];

interface PracticeTabProps {
  onOpenSplitDemo?: (char: string) => void;
  /** 从学习 Tab「去练习」传入的练习范围 */
  practiceScope?: string | null;
  /** 范围已消费，通知父级清空 */
  onPracticeScopeHandled?: () => void;
  /** 跳转到复习 Tab（今日计划的复习任务用） */
  onGotoReview?: () => void;
}

type PracticeKind =
  | 'course'
  | 'key-drill'
  | 'radical-identify'
  | 'radical-sequence'
  | 'char-code'
  | 'simplified-code'
  | 'phrase-code'
  | 'article'
  | 'custom-article'
  /** 错字专项（由成绩面板「练习错字」发起，不在模式选择列表中出现） */
  | 'wrong-chars';

interface ModeConfig {
  kind: PracticeKind;
  label: string;
  icon: React.ReactNode;
  desc: string;
  /** 是否需要 chars chunk */
  needsChars?: boolean;
  /** 是否需要 phrases chunk */
  needsPhrases?: boolean;
}

const MODES: ModeConfig[] = [
  {
    kind: 'course',
    label: '课程闯关',
    icon: <TrophyOutlined />,
    desc: '按区逐关推进，三环节掌握每个键位',
  },
  {
    kind: 'key-drill',
    label: '键位热身',
    icon: <ThunderboltOutlined />,
    desc: '看到字母按键位，建立手指肌肉记忆',
  },
  {
    kind: 'radical-identify',
    label: '字根定位',
    icon: <AppstoreOutlined />,
    desc: '看字根找键位，或看键位选字根',
    needsChars: true,
  },
  {
    kind: 'radical-sequence',
    label: '字根序列',
    icon: <OrderedListOutlined />,
    desc: '连续输入 3~6 个字根对应的键位',
    needsChars: true,
  },
  {
    kind: 'char-code',
    label: '单字拆分',
    icon: <FontSizeOutlined />,
    desc: '打出汉字的完整编码，答错即看拆字',
    needsChars: true,
  },
  {
    kind: 'simplified-code',
    label: '简码专项',
    icon: <RocketOutlined />,
    desc: '一级简码一键出字，二三级简码提速',
    needsChars: true,
  },
  {
    kind: 'phrase-code',
    label: '词组输入',
    icon: <BlockOutlined />,
    desc: '二字/三字/四字/多字词组取码训练',
    needsPhrases: true,
  },
  {
    kind: 'article',
    label: '文章练习',
    icon: <FileTextOutlined />,
    desc: '分级短文综合测速，检验真实打字水平',
    needsChars: true,
  },
  {
    kind: 'custom-article',
    label: '自定义文本',
    icon: <EditOutlined />,
    desc: '粘贴任意中文文本练习（上限 5000 字）',
    needsChars: true,
  },
];

/** 错字专项模式（不在 MODES 列表中，仅由成绩面板触发） */
const WRONG_CHARS_MODE: ModeConfig = {
  kind: 'wrong-chars',
  label: '错字专项',
  icon: <FontSizeOutlined />,
  desc: '针对本轮错字再练一轮',
  needsChars: true,
};

/**
 * 需要先选参数才能开始的模式。
 *
 * 这三种模式各自有分区 / 方向 / 词组长度选项，此前选项状态虽已存在、
 * 却从未渲染出选择器 —— 用户只能用默认值练习。
 */
const OPTION_MODES = new Set<PracticeKind>(['key-drill', 'radical-identify', 'phrase-code']);

const ROUND_SIZE = 20;

/** 空错误分析结果（会话刚开始、尚未结算时占位） */
const EMPTY_ERROR_SUMMARY: ErrorSummary = analyzeErrors(null, []);

/** 教程章节的 practiceScope → 练习模式映射 */
const SCOPE_TO_KIND: Record<string, PracticeKind> = {
  'key-position': 'key-drill',
  radical: 'radical-identify',
  'single-char': 'char-code',
  simplified: 'simplified-code',
  phrase: 'phrase-code',
};

const PracticeTab: React.FC<PracticeTabProps> = ({
  onOpenSplitDemo,
  practiceScope,
  onPracticeScopeHandled,
  onGotoReview,
}) => {
  const [selectedMode, setSelectedMode] = useState<ModeConfig | null>(null);
  const [lastResult, setLastResult] = useState<SessionResult | null>(null);
  const [zoneScope, setZoneScope] = useState<'all' | WubiZone>('all');
  const [radicalDirection, setRadicalDirection] = useState<'forward' | 'backward'>('forward');
  const [phraseLength, setPhraseLength] = useState<2 | 3 | 4 | 'multi'>(2);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  /**
   * 待启动的文章/自定义文本。
   * 单独用 state 承载，由下方 effect 在「码表就绪」后启动，
   * 避免 setTimeout 闭包捕获到旧的 dataState.chars 导致静默失败。
   */
  const [pendingStart, setPendingStart] = useState<{ text: string } | null>(null);
  /** 当前正在进行的课程关卡（null = 非关卡练习） */
  const [lessonContext, setLessonContext] = useState<{ lesson: Lesson; stage: LessonStage } | null>(null);
  /** 待启动的关卡（等码表就绪） */
  const [pendingLesson, setPendingLesson] = useState<{ lesson: Lesson; stage: LessonStage } | null>(null);
  /** 错字专项的题目池 */
  const [wrongCharsPool, setWrongCharsPool] = useState<string[]>([]);
  /** 与上一次同类练习的对比（Story 4.2） */
  const [comparison, setComparison] = useState<ModeComparison | null>(null);
  /** 错误分析结果（Story 4.2） */
  const [errorSummary, setErrorSummary] = useState<ErrorSummary | null>(null);
  /** 本次新解锁的成就（Story 4.4，Toast 展示后移除） */
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  /** 是否正在展示「开始前的参数选择」面板 */
  const [awaitingOptions, setAwaitingOptions] = useState(false);

  /*
   * ── 中断与恢复 ──
   *
   * 本轮题序种子**不在这里**：它由会话层（usePracticeSession）持有，
   * 与驱动题序的题源同一个生命周期。放在本组件的 ref 里曾经导致
   * 「组件一重挂载，种子就换了而题源没换」，快照记的种子与真实题序永久错开 ——
   * 详见 usePracticeSession 里 seedRef 的说明。
   */
  /** 挂载时读到的中断现场（「继续上次练习」卡片的数据源） */
  const [interrupted, setInterrupted] = useState<PracticeSnapshot | null>(null);
  /** 已决定恢复、等码表就绪后真正执行的现场 */
  const [pendingResume, setPendingResume] = useState<PracticeSnapshot | null>(null);
  /** 上次写快照的时刻，用于节流 */
  const snapshotAtRef = useRef(0);

  const {
    state: dataState, loadChars, loadPhrases, retryChars, retryPhrases,
    charsReady, phraseDataFor,
  } = useWubiData();

  /*
   * 词组按长度分桶，只加载当前长度需要的 chunk：
   * 二字词练习拉 90KB 而不是把 150KB 全拉下来。
   */
  const phraseBuckets = useMemo(() => bucketsForPhraseLength(phraseLength), [phraseLength]);
  const phraseData = phraseDataFor(phraseBuckets);
  const phrasesReady = phraseData.status === 'ready' && phraseData.map !== null;

  const {
    recordSession, getModeRecord, loadReview,
    loadInterruptedSession: loadInterrupted,
    saveInterruptedSession: saveInterrupted,
    clearInterruptedSession: clearInterrupted,
  } = useWubiStorage();
  const {
    progress: courseProgress, coverage, statusOf,
    recordLesson, setFreeMode, reset: resetCourse,
  } = useCourseProgress();

  // 今日计划需要的数据源
  const { snapshot: statsSnapshot, checkAndUnlock } = useWubiStats();
  const { dueItems, refresh: refreshReview } = useReview();

  // 会话结束：计算对比 + 错误分析，再一次性落盘（日统计 / 错题本 / 成绩记录 / 课程关卡）
  const handleSessionEnd = useCallback((result: SessionResult) => {
    const now = Date.now();
    // 关卡练习按「关卡.环节」单独分组，才能做同类对比
    const modeKey = lessonContext
      ? lessonModeKey(lessonContext.lesson.id, lessonContext.stage.kind)
      : (selectedMode?.kind ?? 'unknown');

    /*
     * !! 顺序敏感 !!
     * 1. 先读上一轮成绩，再 recordSession（后者会覆盖 last），
     *    反了的话差值恒为 0，对比功能形同虚设。
     * 2. 成就判定必须放在所有落盘之后 —— 它读的是 storage，
     *    而关卡通关会改变 passedLessons。
     */
    const prevRecord = getModeRecord(modeKey);
    const summary = toSummary(result, now);

    setLastResult(result);
    setComparison(compareWithLast(summary, prevRecord));
    setErrorSummary(analyzeErrors(result, loadReview(), { now }));

    recordSession(result, modeKey);
    if (lessonContext) {
      recordLesson(lessonContext.lesson.id, result);
    }

    const newly = checkAndUnlock();
    if (newly.length > 0) {
      setNewAchievements((prev) => Array.from(new Set([...prev, ...newly])));
    }

    // 刷新待复习计数：本轮新错字已入队，今日计划需要立刻反映
    refreshReview();
  }, [
    recordSession, getModeRecord, loadReview, recordLesson, lessonContext,
    selectedMode, checkAndUnlock, refreshReview,
  ]);

  const {
    session, metrics, imeComposing, keyboardAttached,
    startError, clearStartError, start, resume, reset, isRunning, skip,
    beginRound, getSeed,
  } = usePracticeSession({
    mode: 'drill',
    onSessionEnd: handleSessionEnd,
  });

  // 按需加载码表
  useEffect(() => {
    if (!selectedMode) return;
    if (selectedMode.needsChars && !charsReady) loadChars();
    if (selectedMode.needsPhrases && !phrasesReady) loadPhrases(phraseBuckets);
  }, [selectedMode, charsReady, phrasesReady, loadChars, loadPhrases, phraseBuckets]);

  // 构建题源
  const buildSource = useCallback((mode: ModeConfig): QuestionSource | null => {
    /*
     * 每个题源都带上本轮种子，取自会话层 —— 与会话正在用的那个是同一个，
     * 不存在「快照记一个、题源用另一个」的可能。
     * 题序可复现是「刷新后接着上一轮继续」的前提。
     */
    const seed = getSeed();

    switch (mode.kind) {
      case 'key-drill':
        return createKeyDrillSource({
          scope: zoneScope === 'all' ? 'all' : 'zone',
          zone: zoneScope === 'all' ? undefined : zoneScope,
          count: ROUND_SIZE,
          seed,
        });
      case 'radical-identify':
        return createRadicalIdentifySource({
          direction: radicalDirection,
          scope: 'all',
          count: ROUND_SIZE,
          seed,
        });
      case 'radical-sequence':
        return createRadicalSequenceSource({ count: ROUND_SIZE, seed });
      case 'char-code':
        if (!dataState.chars) return null;
        return createCharCodeSource({ count: ROUND_SIZE, seed }, dataState.chars);
      case 'wrong-chars':
        // 错字专项：题量 = 错字个数（不凑满 20 题，避免重复刷同样的字）
        if (!dataState.chars || wrongCharsPool.length === 0) return null;
        return createCharCodeSource(
          { count: wrongCharsPool.length, chars: wrongCharsPool, seed },
          dataState.chars,
        );
      case 'simplified-code':
        if (!dataState.chars) return null;
        return createSimplifiedCodeSource(
          { level: 'all', count: ROUND_SIZE, seed }, dataState.chars,
        );
      case 'phrase-code':
        if (!phraseData.map) return null;
        return createPhraseCodeSource(
          { length: phraseLength, count: ROUND_SIZE, seed }, phraseData.map,
        );
      case 'article':
        if (!dataState.chars || !selectedArticle) return null;
        return createArticleSource({
          scope: 'builtin',
          text: selectedArticle.text,
          skipUncodable: true,
        }, dataState.chars);
      case 'custom-article':
        if (!dataState.chars || !customText.trim()) return null;
        return createArticleSource({
          scope: 'custom',
          text: customText,
          skipUncodable: true,
        }, dataState.chars);
      default:
        return null;
    }
  }, [
    getSeed, zoneScope, radicalDirection, phraseLength, selectedArticle,
    customText, wrongCharsPool, dataState.chars, phraseData.map,
  ]);

  /*
   * 把「重建题源所需的参数」压成可持久化的原始值。
   *
   * 只有影响出题的字段入快照 —— 模式本身、题量等由 buildSource 与 MODES
   * 决定，存了反而多一处会漂移的真相。
   */
  const captureParams = useCallback((mode: ModeConfig): Record<string, string | number | boolean | string[]> => {
    switch (mode.kind) {
      case 'key-drill':
        return { zoneScope };
      case 'radical-identify':
        return { direction: radicalDirection };
      case 'phrase-code':
        return { length: phraseLength };
      case 'wrong-chars':
        return { chars: wrongCharsPool };
      case 'custom-article':
        return { text: customText };
      case 'article':
        return { articleId: selectedArticle?.id ?? '' };
      default:
        return {};
    }
  }, [zoneScope, radicalDirection, phraseLength, wrongCharsPool, customText, selectedArticle]);

  /** 组装并写入中断现场；不合规（模式不支持）时什么都不做 */
  const writeSnapshot = useCallback(() => {
    if (!selectedMode || !isRunning) return;

    const snapshot = buildSnapshot({
      modeKind: selectedMode.kind,
      params: captureParams(selectedMode),
      // 取自会话层：与建题源用的是同一个种子，不可能错开
      seed: getSeed(),
      completed: session.completedCount,
      // 当前题已输入的键：文章模式的**全部进度**都在这里，不能丢
      inputKeys: session.inputKeys,
      counters: {
        completedCount: session.completedCount,
        totalKeystrokes: session.totalKeystrokes,
        errorKeystrokes: session.errorKeystrokes,
        wrongChars: session.wrongChars,
        attemptedChars: session.attemptedChars,
        correctCharCount: session.correctCharCount,
        wrongQuestionCount: session.wrongQuestionCount,
        wrongKeys: session.wrongKeys,
        keyErrors: session.keyErrors,
        maxCombo: session.maxCombo,
      },
      elapsedMs: metrics.elapsedSec * 1000,
      now: Date.now(),
    });

    if (snapshot) saveInterrupted(serializeSnapshot(snapshot));
  }, [
    selectedMode, isRunning, captureParams, session, metrics.elapsedSec,
    getSeed, saveInterrupted,
  ]);

  /*
   * 持续写入中断现场，但有节流。
   *
   * 模块约定「不在按键过程中高频写入」：这里最多 1s 写一次，
   * 另配 pagehide 兜住最后一次（见下一个 effect）。
   */
  useEffect(() => {
    const now = Date.now();
    if (now - snapshotAtRef.current < 1000) return;
    snapshotAtRef.current = now;
    writeSnapshot();
  }, [session, writeSnapshot]);

  /*
   * 页面隐藏 / 关闭前补一次，避免最多丢掉 1s 的进度。
   *
   * !! 必须是 useLayoutEffect，不能是 useEffect !!
   *
   * 被动 effect（useEffect）在**浏览器绘制之后**才执行。于是有这样的时序：
   *   用户按下最后一键 → setState → 重渲染 → 用户立刻刷新 →
   *   此时 pagehide 触发，而重新绑定监听器的 effect **还没跑**，
   *   于是调用的是**上一个渲染**绑定的那个监听器，它捕获的 `session` 是旧的。
   *
   * 症状极具迷惑性：`savedAt` 是调用时取的 `Date.now()`，看起来刚刚写过
   * （实测与刷新时刻只差 228ms），但内容里的 `completed` 落后一题 ——
   * 恢复出来就是"上一道题"。实测复现：同一轮里一次对一次错。
   *
   * 布局 effect 在 DOM 变更后**同步**执行、早于绘制，于是按键引发的重渲染
   * 一定先换好监听器，用户再怎么立刻刷新，拿到的都是最新状态。
   */
  useLayoutEffect(() => {
    const flush = () => writeSnapshot();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [writeSnapshot]);

  /*
   * 本轮结束（打完 / 跳过 / 返回）即清除中断现场 ——
   * 留着会让下次进来弹出一个「继续」到一轮已经结束的练习。
   */
  useEffect(() => {
    if (session.status !== 'finished') return;
    clearInterrupted();
    setInterrupted(null);
  }, [session.status, clearInterrupted]);

  // 挂载时读一次中断现场；过期 / 损坏 / 版本不符都会被 parseSnapshot 挡掉
  useEffect(() => {
    setInterrupted(parseSnapshot(loadInterrupted(), Date.now()));
  }, [loadInterrupted]);

  /** 点击「继续上次练习」：先把参数与种子还原，再交给 pendingResume effect 启动 */
  const handleResume = useCallback(() => {
    if (!interrupted) return;

    const mode = MODES.find((m) => m.kind === interrupted.modeKind);
    if (!mode) {
      // 模式已不存在（版本变更）：丢弃，不猜
      clearInterrupted();
      setInterrupted(null);
      return;
    }

    const p = interrupted.params;
    /*
     * 参数逐个校验后再应用。
     * 快照来自 localStorage，可能被旧版本写过或被手改 —— 直接塞进 state
     * 会把非法值带进 buildSource（例如 zoneScope 传了个不存在的分区）。
     */
    if (typeof p.zoneScope === 'string'
      && (p.zoneScope === 'all' || p.zoneScope in ZONE_LABELS)) {
      setZoneScope(p.zoneScope as 'all' | WubiZone);
    }
    if (p.direction === 'forward' || p.direction === 'backward') {
      setRadicalDirection(p.direction);
    }
    if (p.length === 2 || p.length === 3 || p.length === 4 || p.length === 'multi') {
      setPhraseLength(p.length);
    }
    if (Array.isArray(p.chars) && p.chars.length > 0) setWrongCharsPool(p.chars);
    if (typeof p.text === 'string' && p.text.trim()) setCustomText(p.text);
    if (typeof p.articleId === 'string') {
      setSelectedArticle(ARTICLES.find((a) => a.id === p.articleId) ?? null);
    }

    // 种子先落定（采纳快照里的那个）：buildSource 在同一 tick 内就要读到它
    beginRound(interrupted.seed);

    setSelectedMode(mode);
    setLastResult(null);
    setComparison(null);
    setErrorSummary(null);
    setWrongCharsPool((prev) => (mode.kind === 'wrong-chars' ? prev : []));
    setAwaitingOptions(false);
    setPendingStart(null);
    setLessonContext(null);
    setPendingLesson(null);
    setCustomError(null);
    clearStartError();
    setInterrupted(null);
    setPendingResume(interrupted);
  }, [interrupted, clearInterrupted, clearStartError, beginRound]);

  // 码表就绪后执行恢复（不重开一轮，而是接着中断的那一题）
  useEffect(() => {
    if (!pendingResume || !selectedMode) return;
    if (selectedMode.needsChars && !charsReady) {
      loadChars();
      return;
    }
    if (selectedMode.needsPhrases && !phrasesReady) {
      loadPhrases(phraseBuckets);
      return;
    }

    const source = buildSource(selectedMode);
    if (!source) {
      clearInterrupted();
      setPendingResume(null);
      return;
    }

    const ok = resume(
      source,
      pendingResume.completed,
      pendingResume.counters,
      pendingResume.elapsedMs,
      pendingResume.inputKeys,
    );
    // 恢复失败（题量已满 / 数据版本变了）：丢弃现场，让用户正常开始新一轮
    if (!ok) clearInterrupted();
    setPendingResume(null);
  }, [
    pendingResume, selectedMode, charsReady, phrasesReady, phraseBuckets,
    buildSource, loadChars, loadPhrases, resume, clearInterrupted,
  ]);

  // 构建课程关卡某环节的题源
  const buildLessonSource = useCallback(
    (lesson: Lesson, stage: LessonStage): QuestionSource | null => {
      const learned = [...getLearnedKeys(lesson.id)];

      switch (stage.kind) {
        case 'recognize':
          /*
           * 字根认知：在**已学键**范围内辨识。
           *
           * 只给本关的键时，每题答案都是同一个字母（学 G 关就是 20 题全按 G），
           * 辨识练习退化成「按同一个键」。从第 2 关起答案会跨键。
           */
          return createRadicalIdentifySource({
            direction: 'forward',
            scope: 'all',
            keys: learned,
            count: ROUND_SIZE,
          });
        case 'input':
          // 字根编码：打出字根的真实编码（王 → gggg，五 → gghg，一 → ggll）
          if (!dataState.chars) return null;
          return createRadicalCodeSource(
            { keys: [lesson.key], count: ROUND_SIZE },
            dataState.chars,
          );
        case 'chars': {
          // 单字练习：只出「本关字根本身」+「只用已学键能拼出」的字
          if (!dataState.chars) return null;
          const chars = getLessonCharPool(
            lesson.key,
            getLearnedKeys(lesson.id),
            dataState.chars,
          );
          if (chars.length === 0) return null;
          return createCharCodeSource({ count: PASS_MIN_CHARS + 5, chars }, dataState.chars);
        }
        default:
          return null;
      }
    },
    [dataState.chars],
  );

  const handleStart = useCallback((mode: ModeConfig) => {
    /*
     * 新一轮 = 新种子，交给会话层生成并保管（同步生效）：
     * 本函数末尾就会调用 buildSource，而 buildSource 从会话层取种子，
     * 所以「建题源用的种子」与「快照记的种子」天生是同一个。
     */
    beginRound();
    setInterrupted(null);
    setPendingResume(null);
    setSelectedMode(mode);
    setLastResult(null);
    setComparison(null);
    setErrorSummary(null);
    setWrongCharsPool([]);
    setAwaitingOptions(false);
    setSelectedArticle(null);
    setPendingStart(null);
    setLessonContext(null);
    setPendingLesson(null);
    setCustomError(null);
    clearStartError();

    // 课程闯关：展示课程地图，不立即开始
    if (mode.kind === 'course') {
      if (!charsReady) loadChars();
      return;
    }

    // 文章 / 自定义文本：先展示选择或输入界面，不立即开始
    if (mode.kind === 'article' || mode.kind === 'custom-article') {
      if (mode.needsChars && !charsReady) loadChars();
      return;
    }

    // 需要先选参数：顺手预热码表，避免用户选完还要等加载
    if (OPTION_MODES.has(mode.kind)) {
      if (mode.needsChars && !charsReady) loadChars();
      if (mode.needsPhrases && !phrasesReady) loadPhrases(phraseBuckets);
      setAwaitingOptions(true);
      return;
    }

    // 码表未就绪时先加载，等 ready 后再启动
    if (mode.needsChars && !charsReady) {
      loadChars();
      return;
    }
    if (mode.needsPhrases && !phrasesReady) {
      loadPhrases(phraseBuckets);
      return;
    }
    const source = buildSource(mode);
    if (source) start(source);
  }, [charsReady, phrasesReady, loadChars, loadPhrases, phraseBuckets, buildSource, start, beginRound]);

  // 码表加载完成后自动启动（文章类需等用户选择/输入，参数类需等用户确认选项）
  useEffect(() => {
    if (!selectedMode || awaitingOptions || isRunning || session.status === 'finished') return;
    // 待恢复时禁止自动开新一轮：否则会先 start 出一个新题序，把恢复顶掉
    if (pendingResume) return;
    if (selectedMode.kind === 'article' || selectedMode.kind === 'custom-article') return;
    const ready = (!selectedMode.needsChars || charsReady) && (!selectedMode.needsPhrases || phrasesReady);
    if (!ready) return;
    const source = buildSource(selectedMode);
    if (source && session.status === 'idle') {
      start(source);
    }
  }, [selectedMode, awaitingOptions, charsReady, phrasesReady, buildSource, start, isRunning, session.status]);

  // 选定文章：只记录选择，启动交给 effect
  const handleSelectArticle = useCallback((article: Article) => {
    setSelectedArticle(article);
    setLastResult(null);
    clearStartError();
    setPendingStart({ text: article.text });
  }, [clearStartError]);

  // 自定义文本：校验通过后交给 effect 启动
  const handleStartCustom = useCallback(() => {
    const validation = validateCustomText(customText);
    if (!validation.ok) {
      setCustomError(validation.error);
      return;
    }
    setCustomError(null);
    clearStartError();
    setPendingStart({ text: customText });
  }, [customText, clearStartError]);

  // 码表就绪后启动待处理的文章/自定义文本练习
  useEffect(() => {
    if (!pendingStart) return;
    if (!dataState.chars) return; // 码表未就绪：停留加载态
    const source = createArticleSource(
      { scope: 'builtin', text: pendingStart.text, skipUncodable: true },
      dataState.chars,
    );
    start(source);
    setPendingStart(null); // 仅启动一次
  }, [pendingStart, dataState.chars, start]);

  // 选定关卡环节：记录上下文并交给 effect 启动
  const handleStartStage = useCallback((lesson: Lesson, stage: LessonStage) => {
    setLessonContext({ lesson, stage });
    setLastResult(null);
    clearStartError();
    setPendingLesson({ lesson, stage });
  }, [clearStartError]);

  // 码表就绪后启动待处理的关卡环节
  useEffect(() => {
    if (!pendingLesson) return;
    if (!charsReady) return; // 码表未就绪：停留加载态
    const source = buildLessonSource(pendingLesson.lesson, pendingLesson.stage);
    if (source) start(source);
    setPendingLesson(null); // 仅启动一次
  }, [pendingLesson, charsReady, buildLessonSource, start]);

  // 消费来自学习 Tab 的「去练习」范围：切到对应模式并启动
  useEffect(() => {
    if (!practiceScope) return;
    const kind = SCOPE_TO_KIND[practiceScope];
    const mode = kind ? MODES.find((m) => m.kind === kind) : undefined;
    if (mode) handleStart(mode);
    onPracticeScopeHandled?.();
    // handleStart / onPracticeScopeHandled 无需进依赖：practiceScope 消费后即被清空
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceScope]);

  /** 丢弃中断现场：清存储 + 收掉卡片 */
  const discardInterrupted = useCallback(() => {
    clearInterrupted();
    setInterrupted(null);
  }, [clearInterrupted]);

  const handleBack = useCallback(() => {
    reset();
    /*
     * 主动返回 = 放弃本轮：顺手清掉中断现场。
     * 不清的话，下次进来会弹出一个「继续」到用户已经退出的练习。
     */
    clearInterrupted();
    setInterrupted(null);
    setPendingResume(null);
    setComparison(null);
    setErrorSummary(null);
    setAwaitingOptions(false);
    // 关卡练习退出时回到课程地图，而非模式选择
    if (lessonContext) {
      setLessonContext(null);
      setPendingLesson(null);
      setLastResult(null);
      clearStartError();
      return;
    }
    setSelectedMode(null);
    setSelectedArticle(null);
    setPendingStart(null);
    setWrongCharsPool([]);
    setLastResult(null);
    clearStartError();
  }, [reset, clearStartError, lessonContext, clearInterrupted]);

  /**
   * 用错字发起专项练习（成绩面板 / 错误分析入口）。
   *
   * 与 handleStart 的区别：不走模式选择，直接以给定字集启动 char-code 题源。
   */
  const handlePracticeWrong = useCallback((chars: string[]) => {
    if (!dataState.chars || chars.length === 0) return;

    const pool = Array.from(new Set(chars)).filter((c) => dataState.chars!.has(c));
    if (pool.length === 0) return;

    setWrongCharsPool(pool);
    setSelectedMode(WRONG_CHARS_MODE);
    setLessonContext(null);
    setPendingLesson(null);
    setSelectedArticle(null);
    setPendingStart(null);
    setLastResult(null);
    setComparison(null);
    setErrorSummary(null);
    clearStartError();

    // 直接启动，避免依赖自动启动 effect 的时序
    const source = createCharCodeSource({ count: pool.length, chars: pool }, dataState.chars);
    start(source);
  }, [dataState.chars, start, clearStartError]);

  const handleRestart = useCallback(() => {
    if (!selectedMode) return;
    clearStartError();
    setComparison(null);
    setErrorSummary(null);

    // 课程关卡：重开当前环节
    if (lessonContext) {
      setLastResult(null);
      setPendingLesson({ ...lessonContext });
      return;
    }

    // 文章 / 自定义文本：重新启动当前已选内容
    if (selectedMode.kind === 'article' && selectedArticle) {
      setLastResult(null);
      setPendingStart({ text: selectedArticle.text });
      return;
    }
    if (selectedMode.kind === 'custom-article' && customText.trim()) {
      setLastResult(null);
      setPendingStart({ text: customText });
      return;
    }

    const source = buildSource(selectedMode);
    if (source) {
      setLastResult(null);
      start(source);
    }
  }, [selectedMode, selectedArticle, customText, lessonContext, buildSource, start, clearStartError]);

  // ── 今日计划（Story 4.4）──
  const nextLesson = useMemo(() => getNextLesson(courseProgress), [courseProgress]);

  const dailyPlan = useMemo(() => buildDailyPlan({
    today: todayKey(),
    dueReviewCount: dueItems.length,
    nextLesson: nextLesson ? { id: nextLesson.id, key: nextLesson.key } : null,
    records: statsSnapshot.modeRecords,
    todayPracticeSec: statsSnapshot.todayPracticeSec,
  }), [dueItems.length, nextLesson, statsSnapshot.modeRecords, statsSnapshot.todayPracticeSec]);

  const handleStartPlanTask = useCallback((taskId: DailyPlanTaskId) => {
    if (taskId === 'review') {
      // 复习是独立 Tab（有自己的队列视图），这里只做导航
      onGotoReview?.();
      return;
    }
    if (taskId === 'lesson') {
      const courseMode = MODES.find((m) => m.kind === 'course');
      if (courseMode) handleStart(courseMode);
      return;
    }
    const articleMode = MODES.find((m) => m.kind === 'article');
    if (articleMode) handleStart(articleMode);
  }, [handleStart, onGotoReview]);

  // ── 参数选择界面（分区 / 方向 / 词组长度）──
  if (selectedMode && awaitingOptions) {
    const optionsReady =
      (!selectedMode.needsChars || charsReady) && (!selectedMode.needsPhrases || phrasesReady);

    return (
      <div className="wt-options">
        <div className="wt-article-picker__bar">
          <button className="wt-practice-session__back" onClick={handleBack}>← 返回</button>
          <h3 className="wt-article-picker__title">{selectedMode.label} · 设置</h3>
        </div>

        {selectedMode.kind === 'key-drill' && (
          <section className="wt-options__group">
            <h4 className="wt-options__label">练习范围</h4>
            <div className="wt-options__choices">
              <button
                className={`wt-options__choice${zoneScope === 'all' ? ' wt-options__choice--active' : ''}`}
                onClick={() => setZoneScope('all')}
              >
                全部 25 键
              </button>
              {ZONES.map((zone) => (
                <button
                  key={zone}
                  className={`wt-options__choice${zoneScope === zone ? ' wt-options__choice--active' : ''}`}
                  onClick={() => setZoneScope(zone)}
                >
                  {ZONE_LABELS[zone]}
                </button>
              ))}
            </div>
          </section>
        )}

        {selectedMode.kind === 'radical-identify' && (
          <section className="wt-options__group">
            <h4 className="wt-options__label">出题方向</h4>
            <div className="wt-options__choices">
              <button
                className={`wt-options__choice${radicalDirection === 'forward' ? ' wt-options__choice--active' : ''}`}
                onClick={() => setRadicalDirection('forward')}
              >
                看字根找键位
              </button>
              <button
                className={`wt-options__choice${radicalDirection === 'backward' ? ' wt-options__choice--active' : ''}`}
                onClick={() => setRadicalDirection('backward')}
              >
                看键位选字根
              </button>
            </div>
          </section>
        )}

        {selectedMode.kind === 'phrase-code' && (
          <section className="wt-options__group">
            <h4 className="wt-options__label">词组长度</h4>
            <div className="wt-options__choices">
              {([
                [2, '二字词（最常用）'],
                [3, '三字词'],
                [4, '四字词'],
                ['multi', '多字词（四字以上）'],
              ] as const).map(([value, label]) => (
                <button
                  key={String(value)}
                  className={`wt-options__choice${phraseLength === value ? ' wt-options__choice--active' : ''}`}
                  onClick={() => setPhraseLength(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="wt-options__hint">
              切换长度会按需加载对应的词组表，首次切换需要短暂等待。
            </p>
          </section>
        )}

        <div className="wt-options__footer">
          {!optionsReady && <span className="wt-options__loading">正在加载所需码表…</span>}
          <button
            className="wt-result__btn wt-result__btn--primary"
            disabled={!optionsReady}
            onClick={() => setAwaitingOptions(false)}
          >
            开始练习
          </button>
        </div>
      </div>
    );
  }

  // ── 模式选择界面 ──
  if (!selectedMode) {
    return (
      <div className="wt-practice-picker">
        {/*
          中断现场卡片。
          刻意做成**显式入口**而不是刷新后静默跳进练习：刷新常常是误操作
          （手滑、切窗口），自动恢复会让人莫名其妙地回到半路，还找不到退路。
        */}
        {interrupted && (
          <div className="wt-practice-resume">
            <div className="wt-practice-resume__info">
              <span className="wt-practice-resume__label">上次练到一半</span>
              <span className="wt-practice-resume__detail">
                {MODES.find((m) => m.kind === interrupted.modeKind)?.label ?? interrupted.modeKind}
                {' · '}已完成 {interrupted.completed} 题
                {' · '}用时 {formatTime(interrupted.elapsedMs / 1000)}
              </span>
            </div>
            <div className="wt-practice-resume__actions">
              <button
                type="button"
                className="wt-practice-resume__resume"
                onClick={handleResume}
              >
                继续练习
              </button>
              <button
                type="button"
                className="wt-practice-resume__discard"
                onClick={discardInterrupted}
              >
                丢弃
              </button>
            </div>
          </div>
        )}

        {/* 今日计划（Story 4.4） */}
        <DailyPlanCard plan={dailyPlan} onStartTask={handleStartPlanTask} />

        <div className="wt-practice-picker__grid">
          {MODES.map((mode) => (
            <button
              key={mode.kind}
              className="wt-practice-picker__card"
              onClick={() => handleStart(mode)}
            >
              <span className="wt-practice-picker__icon">{mode.icon}</span>
              <span className="wt-practice-picker__label">{mode.label}</span>
              <span className="wt-practice-picker__desc">{mode.desc}</span>
            </button>
          ))}
        </div>

        {/* 成就 Toast（不打断练习：固定右下角、自动消失、不抢焦点） */}
        <AchievementToast
          ids={newAchievements}
          onDismiss={(id) => setNewAchievements((prev) => prev.filter((x) => x !== id))}
        />
      </div>
    );
  }

  // ── 课程地图 ──
  if (selectedMode.kind === 'course' && !lessonContext) {
    return (
      <CourseMap
        statusOf={statusOf}
        coverage={coverage}
        freeMode={courseProgress.freeMode}
        records={courseProgress.lessons}
        onStartStage={handleStartStage}
        onToggleFreeMode={setFreeMode}
        onReset={resetCourse}
        onBack={() => setSelectedMode(null)}
      />
    );
  }

  // ── 文章选择界面 ──
  if (selectedMode.kind === 'article' && !selectedArticle) {
    return (
      <div className="wt-article-picker">
        <div className="wt-article-picker__bar">
          <button className="wt-practice-session__back" onClick={handleBack}>← 返回</button>
          <h3 className="wt-article-picker__title">选择文章</h3>
        </div>
        <div className="wt-article-picker__list">
          {ARTICLES.map((article) => {
            const charCount = Array.from(article.text).length;
            return (
              <button
                key={article.id}
                className="wt-article-picker__item"
                onClick={() => handleSelectArticle(article)}
              >
                <div className="wt-article-picker__item-head">
                  <span className="wt-article-picker__item-title">{article.title}</span>
                  <span className={`wt-article-picker__badge wt-article-picker__badge--${article.difficulty}`}>
                    {DIFFICULTY_LABELS[article.difficulty]}
                  </span>
                </div>
                <div className="wt-article-picker__item-meta">
                  {charCount} 字 · 约 {estimateMinutes(article.text)} 分钟
                </div>
                <div className="wt-article-picker__item-preview">
                  {article.text.slice(0, 40)}…
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 自定义文本输入界面 ──
  if (selectedMode.kind === 'custom-article' && session.status === 'idle' && !pendingStart) {
    return (
      <div className="wt-custom-input">
        <div className="wt-article-picker__bar">
          <button className="wt-practice-session__back" onClick={handleBack}>← 返回</button>
          <h3 className="wt-article-picker__title">自定义文本练习</h3>
        </div>
        <textarea
          className="wt-custom-input__area"
          placeholder="在此粘贴任意中文文本（上限 5000 字）…"
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value);
            setCustomError(null);
          }}
          rows={12}
        />
        <div className="wt-custom-input__footer">
          <span className="wt-custom-input__count">
            {Array.from(customText).length} / 5000 字
          </span>
          {customError && <span className="wt-custom-input__error">{customError}</span>}
          <button
            className="wt-result__btn wt-result__btn--primary"
            onClick={handleStartCustom}
          >
            开始练习
          </button>
        </div>
      </div>
    );
  }

  // ── 码表加载中 / 会话启动中 ──
  const charsFailed = (selectedMode.needsChars && dataState.charsStatus === 'failed')
    || (selectedMode.needsPhrases && phraseData.status === 'failed');
  const charsLoading = (selectedMode.needsChars && !charsReady)
    || (selectedMode.needsPhrases && !phrasesReady);
  // 会话尚未启动且无错误：属于「码表就绪 → effect 启动」的过渡帧
  const awaitingStart = session.status === 'idle' && !startError;

  if (charsLoading || awaitingStart) {
    if (charsFailed) {
      return (
        <div className="wt-practice-loading">
          <p className="wt-practice-loading__error">
            {dataState.charsError || phraseData.error || '码表加载失败'}
          </p>
          <button
            className="wt-practice-loading__retry"
            onClick={() => {
              if (selectedMode.needsChars) retryChars();
              if (selectedMode.needsPhrases) retryPhrases(phraseBuckets);
            }}
          >
            重试
          </button>
          <button className="wt-practice-loading__back" onClick={handleBack}>返回</button>
        </div>
      );
    }
    return (
      <div className="wt-practice-loading">
        <div className="wt-tutorial__loading-spinner" />
        <p>{charsLoading ? '正在加载码表…' : '正在准备练习…'}</p>
      </div>
    );
  }

  // ── 启动失败 ──
  if (startError) {
    return (
      <div className="wt-practice-loading">
        <p className="wt-practice-loading__error">无法开始练习：{startError}</p>
        <button className="wt-practice-loading__retry" onClick={handleRestart}>重试</button>
        <button className="wt-practice-loading__back" onClick={handleBack}>返回</button>
      </div>
    );
  }

  // ── 练习界面 ──
  const isArticleMode = selectedMode.kind === 'article' || selectedMode.kind === 'custom-article';

  return (
    <div className="wt-practice-session">
      {/* 会话工具条 */}
      <div className="wt-practice-session__bar">
        <button className="wt-practice-session__back" onClick={handleBack}>
          ← 退出
        </button>
        <span className="wt-practice-session__mode">
          {selectedMode.icon} {selectedMode.label}
        </span>
        <span className="wt-practice-session__progress">
          {session.completedCount} / {session.questionState?.total ?? '∞'}
        </span>
        <button className="wt-practice-session__restart" onClick={handleRestart}>
          重开
        </button>
      </div>

      {/* IME 警告 */}
      {imeComposing && (
        <div className="wt-ime-warning">
          ⚠ 请切换到英文输入状态（当前中文输入法会拦截按键）
        </div>
      )}

      {/* 键盘未挂载警告（窄屏） */}
      {isRunning && !keyboardAttached && (
        <div className="wt-ime-warning">
          ⚠ 当前窗口宽度不足 1024px，键盘监听未启用。请加宽窗口后点击「重开」。
        </div>
      )}

      {/* 练习看板：文章模式用专用看板，其余用通用看板 */}
      {isArticleMode ? (
        <ArticleBoard
          session={session}
          metrics={metrics}
          showMetricsBar
          frozen={session.status === 'finished'}
          onOpenSplitDemo={onOpenSplitDemo ?? (() => {})}
          onSkip={skip}
        />
      ) : (
        <PracticeBoard
          session={session}
          metrics={metrics}
          showVirtualKeyboard
          showMetricsBar
          frozen={session.status === 'finished'}
          onOpenSplitDemo={onOpenSplitDemo ?? (() => {})}
        />
      )}

      {/* 会话结束面板（成绩 + 错误分析） */}
      {session.status === 'finished' && lastResult && (
        <ResultPanel
          result={lastResult}
          comparison={comparison}
          errorSummary={errorSummary ?? EMPTY_ERROR_SUMMARY}
          lessonVerdict={lessonContext ? (() => {
            const evaluation = evaluateLesson(lastResult);
            return {
              passed: evaluation.passed,
              reasons: evaluation.reasons,
              lessonKey: lessonContext.lesson.key,
            };
          })() : null}
          modeLabel={selectedMode.label}
          onRestart={handleRestart}
          onPracticeWrong={handlePracticeWrong}
          onBack={handleBack}
          onOpenSplitDemo={onOpenSplitDemo}
        />
      )}

      {/* 键盘状态 + 快捷键提示 */}
      {isRunning && (
        <div className="wt-practice-session__footer-info">
          <span
            className={`wt-kbd-status${keyboardAttached ? ' wt-kbd-status--ok' : ' wt-kbd-status--off'}`}
          >
            {keyboardAttached ? '⌨ 键盘已就绪' : '⌨ 键盘未挂载'}
            <span className="wt-kbd-status__count">
              已接收 {session.totalKeystrokes} 次击键
            </span>
          </span>
          <span className="wt-practice-session__hotkeys">
            <kbd>Tab</kbd> 重开 · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 跳过 · <kbd>Esc</kbd> 退出
          </span>
        </div>
      )}
    </div>
  );
};

export default PracticeTab;
