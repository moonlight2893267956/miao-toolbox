/**
 * 语音翻译字幕（FR-13，story-3.3）工具。
 *
 * 百度语音翻译 v2 仅返回整段 `source`/`target` 文本，不提供分句级时间戳，
 * 因此字幕的分句与「时间轴」均在前端推导：
 * - 分句：按句末标点切分原文/译文，按索引配对；两侧句数不一致时将较长一侧
 *   的剩余内容并入最后一段，避免产生空字幕。若 ASR 未返回句末标点则整段作为一条字幕。
 * - 时间轴：百度无真实语音时间戳（真实时间戳需流式接口，归 story-5.1），
 *   此处用录音总时长在字幕段间均摊得到近似时间码，仅用于呈现顺序与时间观感。
 */

/** 单条字幕段（原文 → 译文 + 近似时间区间） */
export interface SubtitleSegment {
  src: string;
  dst: string;
  /** 该字幕段的近似起始时间（秒），非真实语音时间戳 */
  start: number;
  /** 该字幕段的近似结束时间（秒），非真实语音时间戳 */
  end: number;
}

/** 句末标点切分（中英文句号/感叹/疑问/分号，保留标点本身） */
const SENTENCE_END = /(?<=[。！？!?；;])\s*/;

function splitSentences(text: string): string[] {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return [];
  const parts = trimmed.split(SENTENCE_END).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [trimmed];
}

/**
 * 将百度返回的整段原文/译文切分为字幕段。
 *
 * @param source 识别原文（sourceText）
 * @param target 翻译译文（translatedText）
 * @param durationSec 录音时长（秒），用于推导近似时间码；缺省时不显示时间码
 */
export function buildSubtitles(
  source: string,
  target: string,
  durationSec = 0,
): SubtitleSegment[] {
  const s = splitSentences(source);
  const t = splitSentences(target);
  if (s.length === 0 && t.length === 0) return [];

  const n = Math.min(s.length, t.length);
  const segs: SubtitleSegment[] = [];
  for (let i = 0; i < n; i++) {
    segs.push({ src: s[i], dst: t[i], start: 0, end: 0 });
  }
  // 两侧句数不一致时，将较长一侧的剩余内容并入最后一段
  const srcRest = s.slice(n).join('');
  const dstRest = t.slice(n).join('');
  if (srcRest || dstRest) {
    if (segs.length) {
      const last = segs[segs.length - 1];
      segs[segs.length - 1] = {
        src: last.src + srcRest,
        dst: last.dst + dstRest,
        start: last.start,
        end: last.end,
      };
    } else {
      segs.push({ src: srcRest, dst: dstRest, start: 0, end: 0 });
    }
  }

  const total = segs.length;
  const dur = durationSec > 0 ? durationSec : 0;
  segs.forEach((seg, i) => {
    seg.start = total > 0 ? (dur * i) / total : 0;
    seg.end = total > 0 ? (dur * (i + 1)) / total : 0;
  });
  return segs;
}

/** 秒 → mm:ss（录音计时 / 字幕时间码共用） */
export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
