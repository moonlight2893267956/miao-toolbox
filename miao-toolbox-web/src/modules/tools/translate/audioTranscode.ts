/**
 * 音频转码工具（FR-12，story-3.2）
 *
 * 浏览器 `MediaRecorder` 在 Chrome/Edge/Firefox 产出 `webm/opus`，Safari 可能产出
 * `mp4/aac`；而百度语音翻译仅接受 `pcm/wav/amr/m4a`。本模块在**纯前端、零依赖**
 * 前提下完成转码：
 *
 *   录音 Blob → AudioContext.decodeAudioData 解出 PCM
 *            → OfflineAudioContext(1 通道, 16kHz) 重采样为单声道 16kHz
 *            → 手写 16-bit PCM WAV 头封成 `audio/wav`
 *
 * 百度要求 ≤60s @ 16k / 16bit / 单声道；60s 单声道 16kHz 16bit ≈ 1.92MB，
 * 低于后端 2MB 上限，WAV 亦在后端白名单内。
 */

/** 单声道 16kHz（百度语音翻译推荐采样率） */
export const TARGET_SAMPLE_RATE = 16000;
/** 单次录音上限（秒），对应百度免费档 ≤60s */
export const MAX_RECORD_SECONDS = 60;

type AudioContextCtor = typeof AudioContext;
type OfflineAudioContextCtor = typeof OfflineAudioContext;

function getAudioContextCtor(): AudioContextCtor {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('NO_AUDIO_CONTEXT');
  return Ctor;
}

function getOfflineAudioContextCtor(): OfflineAudioContextCtor {
  const w = window as unknown as {
    OfflineAudioContext?: OfflineAudioContextCtor;
    webkitOfflineAudioContext?: OfflineAudioContextCtor;
  };
  const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctor) throw new Error('NO_OFFLINE_CONTEXT');
  return Ctor;
}

/**
 * 将任意浏览器可解码的音频 Blob 转码为 WAV（16kHz / 单声道 / 16bit）。
 * @throws 转码失败时抛出带语义的 Error（调用方映射为友好文案）
 */
export async function transcodeToWav(
  blob: Blob,
  targetRate: number = TARGET_SAMPLE_RATE,
): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctor = getAudioContextCtor();
  const ctx = new Ctor();

  let sourceBuffer: AudioBuffer;
  try {
    // 部分浏览器需 resume 后才允许解码
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    sourceBuffer = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    ctx.close().catch(() => undefined);
    throw new Error('DECODE_FAILED');
  }

  try {
    const OfflineCtor = getOfflineAudioContextCtor();
    const frameCount = Math.max(1, Math.ceil(sourceBuffer.duration * targetRate));
    const offline = new OfflineCtor(1, frameCount, targetRate);
    const src = offline.createBufferSource();
    src.buffer = sourceBuffer;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0); // 单声道 Float32 [-1, 1]
    const wav = encodeWav(samples, targetRate);
    return new Blob([wav], { type: 'audio/wav' });
  } finally {
    ctx.close().catch(() => undefined);
  }
}

/**
 * 将 Float32 PCM 样本编码为 16-bit PCM WAV（标准 44 字节头）。
 */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}
