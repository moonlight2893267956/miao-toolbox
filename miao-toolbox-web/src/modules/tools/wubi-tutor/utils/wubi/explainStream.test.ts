/**
 * `consumeExplainStream` 的流消费契约测试。
 *
 * 这里覆盖的是「跨仓库契约」而不是实现细节：
 * - 哪些事件被消费、哪些被丢弃（丢错一个就会污染正文或丢掉会话 id）；
 * - 会话 id / 轮次号有没有真的交给调用方（漏了 = 首轮成功但追问永远不可用）；
 * - 流中 error 与传输层错误如何归一（决定调用方是否回退）。
 *
 * 用一个假的 `fetch` + `ReadableStream` 造流，不需要真实网络。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamFailure, consumeExplainStream } from './explainStream';
import type { ExecTrace } from './execStream';

/** 把 SSE 原文包成一个 Response（body 按给定分块吐出，用于模拟网络分包） */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const exec = (payload: Record<string, unknown>) =>
  `event: exec\ndata: ${JSON.stringify(payload)}\n\n`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const collect = async (chunks: string[]) => {
  fetchMock.mockResolvedValue(sseResponse(chunks));
  const traces: ExecTrace[] = [];
  const conversations: { conversationId: string | null; turn: number | null }[] = [];
  type DonePayload = { output: Record<string, unknown> | null; traceId: string | null };
  const doneBox: { value: DonePayload | null } = { value: null };

  await consumeExplainStream(
    '/api/wubi/ai/explain/stream',
    { char: '编' },
    {
      onExec: (t) => traces.push(t),
      onConversation: (c) => conversations.push(c),
      onDone: (d) => {
        doneBox.value = d;
      },
    },
    new AbortController().signal,
  );
  return { traces, conversations, done: doneBox.value };
};

describe('consumeExplainStream —— 事件消费', () => {
  it('exec 折叠进过程轨，按 call_id 就地更新', async () => {
    const { traces } = await collect([
      exec({ kind: 'tool_call', call_id: 'c1', name: 'tavily.search' }),
      exec({ kind: 'tool_result', call_id: 'c1', name: 'tavily.search', ok: true, ms: 4206 }),
      'event: done\ndata: {"output":{"code":"xyna"}}\n\n',
    ]);
    expect(traces).toHaveLength(2);
    expect(traces[0].entries[0].status).toBe('running');
    expect(traces[1].entries).toHaveLength(1); // 就地更新，不是两行
    expect(traces[1].entries[0]).toMatchObject({ status: 'ok', ms: 4206 });
  });

  it('conversation 事件把会话 id 与轮次号交给调用方（漏了追问就永远不可用）', async () => {
    const { conversations } = await collect([
      'event: conversation\ndata: {"conversation_id":"conv_9","turn":3,"history_truncated":true}\n\n',
      exec({ kind: 'log', text: 'ok' }),
      'event: done\ndata: {"output":{"code":"xyna"}}\n\n',
    ]);
    expect(conversations[0]).toMatchObject({
      conversationId: 'conv_9',
      turn: 3,
      historyTruncated: true,
    });
  });

  it('done 事件给出 output 与 traceId（唯一可信来源）', async () => {
    const { done } = await collect([
      'event: done\ndata: {"trace_id":"t9","output":{"code":"xyna","positions":[{"radical":"纟"}]}}\n\n',
    ]);
    expect(done).toEqual({
      output: { code: 'xyna', positions: [{ radical: '纟' }] },
      traceId: 't9',
    });
  });

  it('token 事件被丢弃（正文不做打字机）', async () => {
    const { traces, done } = await collect([
      'event: token\ndata: {"token":"这段正文不该被消费"}\n\n',
      'event: done\ndata: {"output":{"code":"xyna"}}\n\n',
    ]);
    expect(traces).toHaveLength(0);
    expect(done?.output).toEqual({ code: 'xyna' });
  });

  it('未知事件名被丢弃，不当作正文（跨仓库约定）', async () => {
    const { traces } = await collect([
      'event: some_future_event\ndata: {"whatever":true}\n\n',
      'event: done\ndata: {"output":{}}\n\n',
    ]);
    expect(traces).toHaveLength(0);
  });

  it('事件被切在两块里也能正确拼接', async () => {
    const full = exec({ kind: 'tool_call', call_id: 'c1', name: 'llm.decide' });
    const cut = Math.floor(full.length / 2);
    const { traces } = await collect([
      full.slice(0, cut),
      full.slice(cut),
      'event: done\ndata: {"output":{}}\n\n',
    ]);
    expect(traces).toHaveLength(1);
    expect(traces[0].entries[0].name).toBe('llm.decide');
  });

  it('多字节中文被分块切断不会乱码', async () => {
    const full = exec({ kind: 'log', level: 'warn', text: '联网检索到的编码都没通过降噪校验' });
    const mid = 40; // 切在中文中间
    const { traces } = await collect([full.slice(0, mid), full.slice(mid), 'event: done\ndata: {}\n\n']);
    expect(traces[0].notes[0].text).toContain('降噪校验');
  });
});

describe('consumeExplainStream —— 失败归一', () => {
  it('流中 error 事件抛 StreamFailure，并带业务码', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(['event: error\ndata: {"code":"AI_QUOTA_EXCEEDED","message":"额度用完了"}\n\n']),
    );
    const promise = consumeExplainStream(
      '/x',
      {},
      { onDone: () => {} },
      new AbortController().signal,
    );
    await expect(promise).rejects.toBeInstanceOf(StreamFailure);
    await expect(promise).rejects.toMatchObject({
      code: 'AI_QUOTA_EXCEEDED',
      message: '额度用完了',
      retriable: false, // 配额类不回退，再打一次只是白等
    });
  });

  it('会话过期（410）是可回退的（回退同步也不会更差）', async () => {
    fetchMock.mockResolvedValue(
      sseResponse(['event: error\ndata: {"code":"AI_CONVERSATION_EXPIRED","message":"过期"}\n\n']),
    );
    const promise = consumeExplainStream('/x', {}, { onDone: () => {} }, new AbortController().signal);
    await expect(promise).rejects.toMatchObject({
      code: 'AI_CONVERSATION_EXPIRED',
      retriable: true,
    });
  });

  it('流没有 done 就结束视为失败（不能拿半截过程冒充完成）', async () => {
    fetchMock.mockResolvedValue(sseResponse([exec({ kind: 'log', text: '进行中' })]));
    const promise = consumeExplainStream('/x', {}, { onDone: () => {} }, new AbortController().signal);
    await expect(promise).rejects.toBeInstanceOf(StreamFailure);
  });

  it('HTTP 非 2xx 读出统一错误壳的 code/message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'AI_AGENT_DISABLED', message: '未启用' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const promise = consumeExplainStream('/x', {}, { onDone: () => {} }, new AbortController().signal);
    await expect(promise).rejects.toMatchObject({
      code: 'AI_AGENT_DISABLED',
      retriable: false,
    });
  });

  it('网络异常归一成可回退的 StreamFailure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const promise = consumeExplainStream('/x', {}, { onDone: () => {} }, new AbortController().signal);
    await expect(promise).rejects.toMatchObject({ retriable: true });
  });

  it('主动中止会立刻退出读循环，不会被包装成 StreamFailure', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    let pushed = false;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(exec({ kind: 'log', text: '跑着呢' })));
            pushed = true;
            // 故意不 close：模拟「模型还在算、流上暂时没有新事件」——
            // 这正是用户点取消时流的真实形态。如果没有 abort 处理，
            // reader.read() 会一直挂着，用户看到的是「点了取消没反应」。
          },
        }),
        { status: 200 },
      ),
    );

    const promise = consumeExplainStream('/x', {}, { onDone: () => {} }, controller.signal);

    // 等第一块被消费掉（说明已经进入读循环），再中止
    await vi.waitFor(() => expect(pushed).toBe(true));
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();

    await expect(promise).rejects.not.toBeInstanceOf(StreamFailure);
  }, 3_000);
});
