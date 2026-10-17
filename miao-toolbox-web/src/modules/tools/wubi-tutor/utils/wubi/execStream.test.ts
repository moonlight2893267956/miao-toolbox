/**
 * `execStream` 纯函数单测。
 *
 * 这些用例对应的是「只有真的被网络切过包才会踩到」的问题，所以刻意覆盖
 * 分包边界、多行 data、孤儿 result、未知事件名等边界。
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_EXEC_TRACE,
  currentEntry,
  foldExec,
  hasRunning,
  isEmptyTrace,
  parseExecData,
  parseSseChunk,
  settledCount,
  toolLabel,
  type ExecTrace,
} from './execStream';

describe('parseSseChunk —— SSE 行解析', () => {
  it('解析单个完整事件', () => {
    const { events, rest } = parseSseChunk('event: exec\ndata: {"kind":"log"}\n\n');
    expect(events).toEqual([{ event: 'exec', data: '{"kind":"log"}' }]);
    expect(rest).toBe('');
  });

  it('解析多个事件并保持顺序', () => {
    const { events } = parseSseChunk(
      'event: exec\ndata: {"a":1}\n\nevent: done\ndata: {"b":2}\n\n',
    );
    expect(events.map((e) => e.event)).toEqual(['exec', 'done']);
  });

  it('一行被切成两块时保留残余，下一次拼回后仍能解析', () => {
    // 网络在 data 中间切断
    const first = parseSseChunk('event: exec\ndata: {"kind":"tool');
    expect(first.events).toHaveLength(0);
    expect(first.rest).toContain('{"kind":"tool');

    const second = parseSseChunk(`${first.rest}_call"}\n\n`);
    expect(second.events).toEqual([{ event: 'exec', data: '{"kind":"tool_call"}' }]);
  });

  it('多行 data 用换行拼接（SSE 规范）', () => {
    const { events } = parseSseChunk('event: exec\ndata: {"a":1,\ndata: "b":2}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"a":1,\n"b":2}');
  });

  it('\\r\\n 行分隔符被归一化', () => {
    const { events } = parseSseChunk('event: exec\r\ndata: {"kind":"log"}\r\n\r\n');
    expect(events).toEqual([{ event: 'exec', data: '{"kind":"log"}' }]);
  });

  it('注释行（心跳）被忽略，不产生事件', () => {
    const { events } = parseSseChunk(': keep-alive\n\nevent: exec\ndata: {}\n\n');
    expect(events).toEqual([{ event: 'exec', data: '{}' }]);
  });

  it('没有 data 的空事件不产生条目', () => {
    const { events } = parseSseChunk('\n\nevent: exec\ndata: {}\n\n');
    expect(events).toHaveLength(1);
  });

  it('未结束的尾巴不会当完整事件抛出（避免半截 JSON 被上抛）', () => {
    const { events, rest } = parseSseChunk('event: exec\ndata: {"half":');
    expect(events).toHaveLength(0);
    expect(rest.length).toBeGreaterThan(0);
  });
});

describe('parseExecData —— JSON 载荷解析', () => {
  it('正常对象', () => {
    expect(parseExecData('{"kind":"log","text":"ok"}')).toMatchObject({ kind: 'log' });
  });

  it('非法 JSON 返回 null（不抛）', () => {
    expect(parseExecData('{oops')).toBeNull();
  });

  it('数组 / 字符串返回 null（不是对象）', () => {
    expect(parseExecData('[1,2]')).toBeNull();
    expect(parseExecData('"text"')).toBeNull();
  });
});

describe('foldExec —— 按 call_id 折叠', () => {
  const call = (callId: string, name: string): Record<string, unknown> => ({
    kind: 'tool_call',
    call_id: callId,
    name,
    seq: 1,
  });
  const result = (callId: string, name: string, extra: Record<string, unknown> = {}) => ({
    kind: 'tool_result',
    call_id: callId,
    name,
    ok: true,
    ms: 1200,
    ...extra,
  });

  it('tool_call 建一行，状态为 ongoing', () => {
    const trace = foldExec(EMPTY_EXEC_TRACE, call('c1', 'tavily.search'));
    expect(trace.entries).toHaveLength(1);
    expect(trace.entries[0]).toMatchObject({
      callId: 'c1',
      name: 'tavily.search',
      status: 'running',
    });
  });

  it('tool_result 就地更新，不追加新行', () => {
    let trace: ExecTrace = foldExec(EMPTY_EXEC_TRACE, call('c1', 'tavily.search'));
    trace = foldExec(trace, result('c1', 'tavily.search'));
    expect(trace.entries).toHaveLength(1);
    expect(trace.entries[0]).toMatchObject({ status: 'ok', ms: 1200 });
  });

  it('ok:false → failed，并保留失败原因', () => {
    let trace = foldExec(EMPTY_EXEC_TRACE, call('c1', 'tavily.search'));
    trace = foldExec(trace, result('c1', 'tavily.search', { ok: false, error: 'OSError: 断网' }));
    expect(trace.entries[0].status).toBe('failed');
    expect(trace.entries[0].error).toBe('OSError: 断网');
  });

  it('ok 缺失按成功处理（对接文档：缺失时按未知处理，不误报失败）', () => {
    let trace = foldExec(EMPTY_EXEC_TRACE, call('c1', 'tables.lookup'));
    trace = foldExec(trace, { kind: 'tool_result', call_id: 'c1', name: 'tables.lookup', ms: 3 });
    expect(trace.entries[0].status).toBe('ok');
  });

  it('孤儿 result（没等到 call）照样建行，不静默丢', () => {
    const trace = foldExec(EMPTY_EXEC_TRACE, result('ghost', 'llm.decide'));
    expect(trace.entries).toHaveLength(1);
    expect(trace.entries[0]).toMatchObject({ callId: 'ghost', status: 'ok' });
  });

  it('多次调用各占一行，互不干扰', () => {
    let trace = foldExec(EMPTY_EXEC_TRACE, call('c1', 'tables.lookup'));
    trace = foldExec(trace, call('c2', 'tavily.search'));
    trace = foldExec(trace, result('c1', 'tables.lookup'));
    trace = foldExec(trace, result('c2', 'tavily.search'));
    expect(trace.entries.map((e) => e.callId)).toEqual(['c1', 'c2']);
    expect(trace.entries.every((e) => e.status === 'ok')).toBe(true);
  });

  it('log 进 notes，不混进工具行', () => {
    const trace = foldExec(EMPTY_EXEC_TRACE, {
      kind: 'log',
      level: 'warn',
      text: '未配置 TAVILY_API_KEY，跳过联网',
    });
    expect(trace.entries).toHaveLength(0);
    expect(trace.notes).toHaveLength(1);
    expect(trace.notes[0]).toMatchObject({ kind: 'log', level: 'warn' });
  });

  it('未知 kind 进 notes，不抛错、不静默丢', () => {
    const trace = foldExec(EMPTY_EXEC_TRACE, { kind: 'custom_metric', text: 'token 用量 120' });
    expect(trace.notes[0]).toMatchObject({ kind: 'custom_metric', text: 'token 用量 120' });
  });

  it('缺 kind 的事件被丢弃（无法归类）', () => {
    const trace = foldExec(EMPTY_EXEC_TRACE, { text: '没有 kind' });
    expect(isEmptyTrace(trace)).toBe(true);
  });

  it('truncated 标记会透出到条目上', () => {
    const trace = foldExec(EMPTY_EXEC_TRACE, {
      kind: 'tool_result',
      call_id: 'c1',
      name: 'tavily.search',
      ok: true,
      truncated: true,
    });
    expect(trace.entries[0].truncated).toBe(true);
  });

  it('纯函数：不修改入参', () => {
    const before = foldExec(EMPTY_EXEC_TRACE, call('c1', 'tables.lookup'));
    const snapshot = JSON.parse(JSON.stringify(before));
    foldExec(before, result('c1', 'tables.lookup'));
    expect(before).toEqual(snapshot);
  });
});

describe('toolLabel —— 工具名映射', () => {
  it('已知工具映射成中文', () => {
    expect(toolLabel('tables.lookup')).toBe('查内置码表');
    expect(toolLabel('tavily.search')).toBe('联网检索');
    expect(toolLabel('llm.decide')).toBe('模型判断拆分');
  });

  it('未知工具名原样返回（不猜、不编中文名）', () => {
    expect(toolLabel('some.custom.tool')).toBe('some.custom.tool');
  });
});

describe('派生查询', () => {
  const build = (specs: { callId: string; status: 'running' | 'ok' | 'failed' }[]): ExecTrace => ({
    entries: specs.map((s) => ({ callId: s.callId, name: s.callId, status: s.status })),
    notes: [],
  });

  it('hasRunning 判断是否仍有调用在跑', () => {
    expect(hasRunning(build([{ callId: 'c1', status: 'ok' }]))).toBe(false);
    expect(hasRunning(build([{ callId: 'c1', status: 'ok' }, { callId: 'c2', status: 'running' }]))).toBe(true);
  });

  it('currentEntry 取最后一个进行中的（串行工具链里它才是当前这一步）', () => {
    const trace = build([
      { callId: 'c1', status: 'ok' },
      { callId: 'c2', status: 'running' },
    ]);
    expect(currentEntry(trace)?.callId).toBe('c2');
  });

  it('currentEntry 无进行中时返回 null', () => {
    expect(currentEntry(build([{ callId: 'c1', status: 'ok' }]))).toBeNull();
  });

  it('settledCount 只数已结束的调用', () => {
    const trace = build([
      { callId: 'c1', status: 'ok' },
      { callId: 'c2', status: 'failed' },
      { callId: 'c3', status: 'running' },
    ]);
    expect(settledCount(trace)).toBe(2);
  });

  it('isEmptyTrace 对空轨为 true', () => {
    expect(isEmptyTrace(EMPTY_EXEC_TRACE)).toBe(true);
    expect(isEmptyTrace(build([{ callId: 'c1', status: 'running' }]))).toBe(false);
  });
});
