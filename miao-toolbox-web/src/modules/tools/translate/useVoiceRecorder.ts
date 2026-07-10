import { useCallback, useEffect, useRef, useState } from 'react';
import { transcodeToWav, getAudioDuration, MAX_RECORD_SECONDS } from './audioTranscode';

/**
 * 语音录音 Hook（FR-12，story-3.2）
 *
 * 封装浏览器录音全链路：
 *  - 特性探测与麦克风权限申请（`getUserMedia`）
 *  - `MediaRecorder` 采集（默认 webm/opus，Safari 可能为 mp4）
 *  - 实时音量分析（`AnalyserNode`）驱动波形
 *  - 计时与 60s 自动停止（百度免费档上限）
 *  - 停止后自动转码为 WAV(16k/单声道) 供后端消费
 *  - 权限/设备/转码异常的友好文案
 *
 * 卸载时清理所有媒体资源（track / AudioContext / 定时器 / objectURL），避免泄漏。
 */

export type VoiceStatus =
  | 'idle' // 空闲，可开始
  | 'requesting' // 正在申请麦克风权限
  | 'recording' // 录音中
  | 'processing' // 停止后转码中
  | 'recorded' // 已就绪可翻译
  | 'unsupported' // 浏览器不支持
  | 'error'; // 权限/设备/转码失败

const BAR_COUNT = 32;
const LEVEL_THROTTLE_MS = 50;

interface VoiceRecorder {
  status: VoiceStatus;
  /** 已录音时长（秒） */
  elapsed: number;
  /** 实时波形，长度 BAR_COUNT，取值 0~1 */
  levels: number[];
  /** 已转码的 WAV Blob（可直接上传后端） */
  audioBlob: Blob | null;
  /** 回放用的 object URL */
  audioUrl: string | null;
  /** 权限/设备/转码 友好错误文案（status=error/unsupported 时非空） */
  error: string | null;
  /** 单次最长录音秒数 */
  maxSeconds: number;
  /** 当前音频来源：麦克风录音 / 导入文件 / 无 */
  sourceType: 'mic' | 'file' | null;
  /** 导入的文件名（sourceType='file' 时展示用） */
  fileName: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
  /** 导入本地音频文件（FR-12b）：校验时长→转码→就绪，复用录音态音频字段 */
  importFile: (file: File) => Promise<void>;
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c));
}

/** 将 getUserMedia 异常名映射为友好中文提示 */
function mapMicError(name: string): string {
  switch (name) {
    case 'NotAllowedError':
      return '麦克风权限被拒绝，请在浏览器地址栏的权限设置中允许麦克风后重试';
    case 'SecurityError':
      return '录音功能需在 HTTPS 或 localhost 环境下使用';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '未检测到麦克风设备，请连接麦克风后重试';
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风被其他程序占用，请关闭占用程序后重试';
    default:
      return `无法访问麦克风（${name || '未知错误'}），请重试`;
  }
}

const idleLevels = () => new Array(BAR_COUNT).fill(0.05);

export function useVoiceRecorder(): VoiceRecorder {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(idleLevels);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'mic' | 'file' | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array | null>(null);
  const urlRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);
  const lastLevelRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopLevelLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevels(idleLevels());
  }, []);

  const startLevelLoop = useCallback((stream: MediaStream) => {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return; // 无 AudioContext 时仅跳过波形，不影响录音
    const ctx = new Ctor();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64; // -> 32 bins，与 BAR_COUNT 对齐
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    freqRef.current = data;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const now = performance.now();
      if (now - lastLevelRef.current >= LEVEL_THROTTLE_MS) {
        lastLevelRef.current = now;
        const next = new Array<number>(BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i += 1) {
          const v = data[i] ?? 0;
          next[i] = Math.max(0.05, v / 255);
        }
        setLevels(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 0.2;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_RECORD_SECONDS) {
        // 到达上限自动停止
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      }
    }, 200);
  }, [stopTimer]);

  const teardownMedia = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(() => {
    setError(null);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setStatus('unsupported');
      setError('当前浏览器不支持录音，请使用最新版 Chrome / Edge / Safari');
      return;
    }
    setStatus('requesting');
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then((stream) => {
        streamRef.current = stream;
        chunksRef.current = [];
        const mime = pickMime();
        const rec = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        recorderRef.current = rec;

        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stopTimer();
          stopLevelLoop();
          const original = new Blob(chunksRef.current, mime ? { type: mime } : undefined);
          setStatus('processing');
          transcodeToWav(original)
            .then((wav) => {
              if (urlRef.current) URL.revokeObjectURL(urlRef.current);
              urlRef.current = URL.createObjectURL(wav);
              setAudioBlob(wav);
              setAudioUrl(urlRef.current);
              setSourceType('mic');
              setStatus('recorded');
            })
            .catch(() => {
              setStatus('error');
              setError('音频转码失败，请使用 Chrome / Edge 浏览器录音后重试');
            })
            .finally(() => {
              // 转码结束再释放音轨与 AudioContext
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
              }
              if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => undefined);
                audioCtxRef.current = null;
              }
            });
        };

        rec.start();
        setStatus('recording');
        elapsedRef.current = 0;
        setElapsed(0);
        startTimer();
        startLevelLoop(stream);
      })
      .catch((err: unknown) => {
        const name = (err as { name?: string })?.name ?? '';
        setStatus('error');
        setError(mapMicError(name));
      });
  }, [startTimer, startLevelLoop, stopLevelLoop, stopTimer]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  /**
   * 导入本地音频文件（FR-12b）：先校验时长，再转码，最后进入「已就绪」态。
   * 复用录音态的 audioBlob/audioUrl/elapsed 字段，使后续翻译链路完全一致。
   */
  const importFile = useCallback(async (file: File) => {
    setError(null);
    // 清理既有状态（无论来源），避免导入态与录音态串味
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setSourceType(null);
    setFileName(null);
    setStatus('processing');

    try {
      // 1. 时长校验（≤60s），解码失败直接走 DECODE_FAILED 友好提示
      const duration = await getAudioDuration(file);
      if (duration > MAX_RECORD_SECONDS + 0.5) {
        setFileName(file.name);
        setStatus('error');
        setError(
          `音频过长（约 ${Math.round(duration)} 秒），请裁剪至 ${MAX_RECORD_SECONDS} 秒以内再导入`,
        );
        return;
      }
      // 2. 转码为 WAV(16k/单声道)
      const wav = await transcodeToWav(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(wav);
      setAudioBlob(wav);
      setAudioUrl(urlRef.current);
      setElapsed(duration);
      setFileName(file.name);
      setSourceType('file');
      setStatus('recorded');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message;
      setStatus('error');
      setError(
        msg === 'DECODE_FAILED'
          ? '无法读取该音频文件，请确认格式受浏览器支持且文件未损坏'
          : '音频处理失败，请重试',
      );
    }
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    stopLevelLoop();
    teardownMedia();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    elapsedRef.current = 0;
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setSourceType(null);
    setFileName(null);
    setStatus('idle');
    setError(null);
  }, [stopTimer, stopLevelLoop, teardownMedia]);

  // 卸载清理：避免麦克风/定时器/URL 泄漏
  useEffect(
    () => () => {
      stopTimer();
      stopLevelLoop();
      teardownMedia();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [stopTimer, stopLevelLoop, teardownMedia],
  );

  return {
    status,
    elapsed,
    levels,
    audioBlob,
    audioUrl,
    error,
    maxSeconds: MAX_RECORD_SECONDS,
    sourceType,
    fileName,
    start,
    stop,
    reset,
    importFile,
  };
}
