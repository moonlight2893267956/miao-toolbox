import { describe, it, expect } from 'vitest';
import { CHALLENGE_CONFIGS } from './challenge';
import {
  createChallengeRuntime,
  tickChallenge,
  loseLife,
  markCleared,
  remainingSeconds,
  OVER_REASON_LABELS,
} from './challengeState';

const SPRINT = CHALLENGE_CONFIGS.sprint;
const SURVIVAL = CHALLENGE_CONFIGS.survival;
const DAILY = CHALLENGE_CONFIGS.daily;

describe('createChallengeRuntime', () => {
  it('按模式初始化命数（非生存模式为 null）', () => {
    expect(createChallengeRuntime(SURVIVAL).lives).toBe(3);
    expect(createChallengeRuntime(SPRINT).lives).toBeNull();
    expect(createChallengeRuntime(DAILY).over).toBe(false);
    expect(createChallengeRuntime(DAILY).overReason).toBeNull();
  });
});

describe('tickChallenge', () => {
  it('未到时限不结束，只推进用时', () => {
    const runtime = tickChallenge(createChallengeRuntime(SPRINT), SPRINT, 30);

    expect(runtime.elapsedSec).toBe(30);
    expect(runtime.over).toBe(false);
  });

  it('到时限即结束（原因 time）', () => {
    const runtime = tickChallenge(createChallengeRuntime(SPRINT), SPRINT, 60);

    expect(runtime.over).toBe(true);
    expect(runtime.overReason).toBe('time');
  });

  it('已结束的运行时原样返回 —— 计时器每 200ms 都在调，不能重复结束', () => {
    const over = tickChallenge(createChallengeRuntime(SPRINT), SPRINT, 60);
    const again = tickChallenge(over, SPRINT, 61);

    expect(again).toBe(over);
  });

  it('不限时模式（生存）推进用时也不会因时间结束', () => {
    const runtime = tickChallenge(createChallengeRuntime(SURVIVAL), SURVIVAL, 999);

    expect(runtime.over).toBe(false);
  });
});

describe('loseLife', () => {
  it('逐条扣命，归零才结束', () => {
    let runtime = createChallengeRuntime(SURVIVAL);

    runtime = loseLife(runtime);
    expect(runtime.lives).toBe(2);
    expect(runtime.over).toBe(false);

    runtime = loseLife(runtime);
    expect(runtime.lives).toBe(1);
    expect(runtime.over).toBe(false);

    runtime = loseLife(runtime);
    expect(runtime.lives).toBe(0);
    expect(runtime.over).toBe(true);
    expect(runtime.overReason).toBe('lives');
  });

  it('命尽后再扣命不会变成负数，也不会改结束原因', () => {
    let runtime = createChallengeRuntime(SURVIVAL);
    for (let i = 0; i < 5; i += 1) runtime = loseLife(runtime);

    expect(runtime.lives).toBe(0);
    expect(runtime.overReason).toBe('lives');
  });

  it('非生存模式无副作用（冲刺 / 每日没有命数概念）', () => {
    const sprint = createChallengeRuntime(SPRINT);
    const daily = createChallengeRuntime(DAILY);

    expect(loseLife(sprint)).toBe(sprint);
    expect(loseLife(daily)).toBe(daily);
  });
});

describe('markCleared', () => {
  it('题量打满即结束（每日挑战）', () => {
    const runtime = markCleared(createChallengeRuntime(DAILY));

    expect(runtime.over).toBe(true);
    expect(runtime.overReason).toBe('cleared');
  });

  it('已结束后不再改写结束原因', () => {
    const over = markCleared(createChallengeRuntime(DAILY));

    expect(markCleared(over)).toBe(over);
  });
});

describe('remainingSeconds', () => {
  it('限时模式给出剩余秒数，且不为负', () => {
    const runtime = tickChallenge(createChallengeRuntime(SPRINT), SPRINT, 20);

    expect(remainingSeconds(runtime, SPRINT)).toBe(40);
    expect(remainingSeconds({ ...runtime, elapsedSec: 999 }, SPRINT)).toBe(0);
  });

  it('不限时模式返回 null（界面据此不渲染倒计时）', () => {
    expect(remainingSeconds(createChallengeRuntime(SURVIVAL), SURVIVAL)).toBeNull();
  });
});

describe('OVER_REASON_LABELS', () => {
  it('三种结束原因都有中文说明', () => {
    expect(OVER_REASON_LABELS.time).toBeTruthy();
    expect(OVER_REASON_LABELS.lives).toBeTruthy();
    expect(OVER_REASON_LABELS.cleared).toBeTruthy();
  });
});
