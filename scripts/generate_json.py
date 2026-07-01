#!/usr/bin/env python3
"""生成指定大小的 JSON 文件

用法示例：
  python3 scripts/generate_json.py -s 1MB -o fixtures/data.json
  python3 scripts/generate_json.py -s 512KB --pretty -o small.json
  python3 scripts/generate_json.py -s 2GB -o huge.json --seed 42
  python3 scripts/generate_json.py -s 100B    # 写入 stdout

支持单位：B / KB / MB / GB（不区分大小写，1KB = 1024B）。
"""
from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
from typing import Any

UNITS = {
    "B":  1,
    "KB": 1024,
    "MB": 1024 * 1024,
    "GB": 1024 * 1024 * 1024,
}


def parse_size(text: str) -> int:
    """把形如 '1.5MB' / '512KB' 的字符串解析为字节数。"""
    s = text.strip().upper().replace(" ", "")
    if not s:
        raise argparse.ArgumentTypeError("大小不能为空")
    # 找单位前缀
    for unit in ("GB", "MB", "KB", "B"):
        if s.endswith(unit):
            num = s[: -len(unit)] or "1"
            try:
                value = float(num)
            except ValueError as e:
                raise argparse.ArgumentTypeError(f"无效的大小: {text!r}") from e
            if value <= 0:
                raise argparse.ArgumentTypeError("大小必须大于 0")
            return int(value * UNITS[unit])
    # 没有单位按字节处理
    try:
        return int(s)
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"无效的大小: {text!r}（缺少单位）") from e


# ——— 数据生成 ———

_FIRST_NAMES = [
    "Alex", "Bella", "Carol", "David", "Erica", "Frank", "Grace", "Henry",
    "Ivy", "Jack", "Kate", "Leo", "Mia", "Nick", "Olivia", "Peter",
    "Queen", "Ryan", "Sara", "Tom", "Uma", "Victor", "Wendy", "Xavier",
    "Yara", "Zoe",
]
_CITIES = [
    "上海", "北京", "深圳", "广州", "杭州", "成都", "武汉", "南京",
    "Suzhou", "Tokyo", "Berlin", "Paris", "London", "New York", "Toronto",
]
_TAGS = [
    "vip", "new", "beta", "premium", "trial", "blocked", "active",
    "inactive", "verified", "guest", "internal", "external",
]
_DOMAINS = ["example.com", "test.org", "demo.io", "mail.cn", "foo.dev"]


def _rand_str(rng: random.Random, n: int) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(rng.choice(alphabet) for _ in range(n))


def _make_record(rng: random.Random, idx: int) -> dict[str, Any]:
    """生成一条结构丰富、体量稳定的 JSON 记录。"""
    first = rng.choice(_FIRST_NAMES)
    last = _rand_str(rng, rng.randint(3, 6)).capitalize()
    name = f"{first} {last}"
    domain = rng.choice(_DOMAINS)
    email = f"{first.lower()}.{_rand_str(rng, rng.randint(3, 5))}@{domain}"
    tag_count = rng.randint(2, 5)
    tags = rng.sample(_TAGS, k=min(tag_count, len(_TAGS)))
    profile = {
        "age": rng.randint(18, 70),
        "city": rng.choice(_CITIES),
        "phone": "+86-" + "".join(rng.choice(string.digits) for _ in range(11)),
        "address": {
            "street": _rand_str(rng, rng.randint(6, 12)) + " St.",
            "zip": "".join(rng.choice(string.digits) for _ in range(6)),
            "geo": {"lat": round(rng.uniform(-90, 90), 6),
                    "lng": round(rng.uniform(-180, 180), 6)},
        },
        "skills": [_rand_str(rng, rng.randint(4, 10)) for _ in range(rng.randint(2, 4))],
    }
    history = [
        {"at": f"2024-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}",
         "action": rng.choice(["login", "purchase", "view", "logout"]),
         "amount": round(rng.uniform(1, 9999), 2)}
        for _ in range(rng.randint(1, 3))
    ]
    return {
        "id": idx,
        "uuid": _rand_str(rng, 32),
        "name": name,
        "email": email,
        "active": rng.random() > 0.2,
        "score": round(rng.uniform(0, 100), 4),
        "tags": tags,
        "profile": profile,
        "history": history,
        "createdAt": f"2024-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}T"
                     f"{rng.randint(0,23):02d}:{rng.randint(0,59):02d}:{rng.randint(0,59):02d}Z",
    }


def build_json(target_bytes: int, *, pretty: bool, seed: int | None) -> dict[str, Any]:
    """构造一个尽量接近 target_bytes 字节的 JSON 对象。

    顶层结构：{"meta": {...}, "data": [<record>, ...]}
    通过不断追加 record 直至序列化结果达到目标大小。
    """
    rng = random.Random(seed)
    records: list[dict[str, Any]] = []
    separators = (",", ":") if not pretty else None
    indent = 2 if pretty else None

    # 始终先写一个 meta 块，再不断追加 data
    def _serialize(n: int) -> bytes:
        doc = {
            "meta": {
                "generator": "generate_json.py",
                "count": n,
                "seed": seed,
            },
            "data": records,
        }
        return json.dumps(doc, ensure_ascii=False, separators=separators, indent=indent).encode("utf-8")

    idx = 0
    while True:
        current = _serialize(idx)
        if current and len(current) >= target_bytes:
            break
        records.append(_make_record(rng, idx))
        idx += 1
        # 安全护栏：避免无限循环
        if idx > 10_000_000:
            print("⚠️  已达到记录上限，停止追加", file=sys.stderr)
            break

    return _serialize(idx)  # type: ignore[return-value]


# ——— CLI ———

def main() -> int:
    p = argparse.ArgumentParser(
        description="生成指定大小的 JSON 文件",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例: %(prog)s -s 1MB -o data.json",
    )
    p.add_argument("-s", "--size", required=True, type=parse_size,
                   help="目标大小，如 512B / 1KB / 10MB / 2GB")
    p.add_argument("-o", "--output", default=None,
                   help="输出文件路径；省略则写入 stdout")
    p.add_argument("--pretty", action="store_true",
                   help="使用缩进美化输出（会增加体积，默认紧凑）")
    p.add_argument("--seed", type=int, default=None,
                   help="随机种子，便于复现")
    args = p.parse_args()

    payload = build_json(args.size, pretty=args.pretty, seed=args.seed)
    actual = len(payload)

    if args.output:
        out_path = os.path.expanduser(args.output)
        os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(payload)
        target_mb = args.size / UNITS["MB"]
        actual_mb = actual / UNITS["MB"]
        ratio = actual / args.size * 100
        print(f"✅ 已生成 {out_path}")
        print(f"   目标: {args.size:,} B  实际: {actual:,} B  ({ratio:.1f}%)")
        if actual_mb >= 1 or target_mb >= 1:
            print(f"   ≈ 目标 {target_mb:.2f} MB / 实际 {actual_mb:.2f} MB")
    else:
        sys.stdout.buffer.write(payload)
        if not payload.endswith(b"\n"):
            sys.stdout.buffer.write(b"\n")
        print(f"# 目标 {args.size:,} B, 实际 {actual:,} B",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
