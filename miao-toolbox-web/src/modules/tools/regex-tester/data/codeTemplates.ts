// 多语言代码生成模板（FR-11 增强版，2026-07-16）
// 参考 regex101 Code Generator 设计：
// - Tab 式语言切换（JS/Java/Python/Go/PHP/C#）
// - 完整可运行代码片段（含 import、正则声明、匹配循环、输出）
// - 自动转义（按目标语言规则处理 \d → "\\d" 等）
// - 标志位映射（JS g → Java 无对应注释、i → Python re.IGNORECASE 等）
import type { CodeGenLanguage } from '../types';

/** 代码生成结果 */
export interface CodeGenResult {
  /** 语言名（用于 Tab 显示） */
  language: string;
  /** 代码片段（完整可运行） */
  code: string;
  /** 标志位差异注释（如有） */
  flagNotes: string[];
}

/** 语言 Tab 配置 */
export interface LanguageTab {
  key: CodeGenLanguage;
  label: string;
}

/** 语言 Tab 列表（供 CodeGenerator 组件渲染） */
export const LANGUAGE_TABS: LanguageTab[] = [
  { key: 'javascript', label: 'JavaScript' },
  { key: 'java',       label: 'Java' },
  { key: 'python',     label: 'Python' },
  { key: 'go',         label: 'Go' },
  { key: 'php',        label: 'PHP' },
  { key: 'csharp',     label: 'C#' },
];

// ── 标志位映射：JS flag key → 目标语言等价写法 ──

interface FlagMapping {
  name: string;
  code: string;
  diff: string | null;
}

type FlagMap = Record<string, FlagMapping>;

const JAVA_FLAG_MAP: FlagMap = {
  g: { name: '无对应', code: '', diff: 'Java 无全局标志，需用 while (matcher.find()) 循环' },
  i: { name: 'CASE_INSENSITIVE', code: 'Pattern.CASE_INSENSITIVE', diff: null },
  m: { name: 'MULTILINE', code: 'Pattern.MULTILINE', diff: null },
  s: { name: 'DOTALL', code: 'Pattern.DOTALL', diff: 'Java 用 Pattern.DOTALL 代替 s 标志' },
  u: { name: 'UNICODE_CASE', code: 'Pattern.UNICODE_CASE', diff: '需配合 CASE_INSENSITIVE 使用' },
};

const PYTHON_FLAG_MAP: FlagMap = {
  g: { name: '无对应', code: '', diff: 'Python 用 re.findall() / re.finditer() 获取全部匹配' },
  i: { name: 'IGNORECASE', code: 're.IGNORECASE', diff: null },
  m: { name: 'MULTILINE', code: 're.MULTILINE', diff: null },
  s: { name: 'DOTALL', code: 're.DOTALL', diff: null },
  u: { name: 'UNICODE', code: 're.UNICODE', diff: 'Python 3 默认 Unicode，通常无需显式指定' },
};

const GO_FLAG_MAP: FlagMap = {
  g: { name: '无对应', code: '', diff: 'Go 的 FindAllString 默认返回所有匹配' },
  i: { name: 'IgnoreCase', code: '(?i)', diff: 'Go 用内联 (?i) 代替标志位' },
  m: { name: 'Multiline', code: '(?m)', diff: 'Go 用内联 (?m) 代替标志位' },
  s: { name: 'DotNL', code: '(?s)', diff: 'Go 用内联 (?s) 代替标志位' },
};

const PHP_FLAG_MAP: FlagMap = {
  g: { name: '无对应', code: '', diff: 'PHP 用 preg_match_all() 获取全部匹配' },
  i: { name: 'i', code: 'i', diff: null },
  m: { name: 'm', code: 'm', diff: null },
  s: { name: 's', code: 's', diff: null },
  u: { name: 'u', code: 'u', diff: 'PCRE_UTF8，启用 UTF-8 模式' },
};

const CSHARP_FLAG_MAP: FlagMap = {
  g: { name: '无对应', code: '', diff: 'C# 用 Regex.Matches() 获取全部匹配' },
  i: { name: 'IgnoreCase', code: 'RegexOptions.IgnoreCase', diff: null },
  m: { name: 'Multiline', code: 'RegexOptions.Multiline', diff: null },
  s: { name: 'Singleline', code: 'RegexOptions.Singleline', diff: 'C# 用 Singleline 代替 s 标志' },
  u: { name: 'CultureInvariant', code: 'RegexOptions.CultureInvariant', diff: '与 JS 的 u 标志不完全等价' },
};

// ── 转义辅助 ──

function escapeForString(pattern: string, quote: string): string {
  return pattern.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote);
}

function escapeForVerbatim(pattern: string): string {
  // Go 反引号和 C# 双引号原始字符串无需转义反斜杠，但需转义反引号/双引号
  return pattern;
}

// ── 代码生成函数（完整可运行代码片段） ──

function collectFlagNotes(map: FlagMap, flags: string): { notes: string[]; mapped: string[] } {
  const notes: string[] = [];
  const mapped: string[] = [];
  for (const f of flags) {
    const m = map[f];
    if (m) {
      if (m.code) mapped.push(m.code);
      if (m.diff) notes.push(m.diff);
    }
  }
  return { notes, mapped };
}

function generateJS(pattern: string, flags: string): CodeGenResult {
  const flagNotes: string[] = [];
  const code = `const regex = /${pattern}/${flags};
const str = 'your test string here';
let match;

${flags.includes('g') ? `while ((match = regex.exec(str)) !== null) {
  console.log(\`Match: \${match[0]} at index \${match.index}\`);
  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      console.log(\`  Group \${name}: \${value}\`);
    }
  }
}` : `const match = regex.exec(str);
if (match) {
  console.log(\`Match: \${match[0]} at index \${match.index}\`);
  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      console.log(\`  Group \${name}: \${value}\`);
    }
  }
}`}`;
  return { language: 'JavaScript', code, flagNotes };
}

function generateJava(pattern: string, flags: string): CodeGenResult {
  const { notes: flagNotes, mapped } = collectFlagNotes(JAVA_FLAG_MAP, flags);
  const escaped = escapeForString(pattern, '"');
  const flagsStr = mapped.length > 0 ? ', ' + mapped.join(' | ') : '';
  const code = `import java.util.regex.*;

public class Main {
    public static void main(String[] args) {
        String str = "your test string here";
        Pattern pattern = Pattern.compile("${escaped}"${flagsStr});
        Matcher matcher = pattern.matcher(str);

        while (matcher.find()) {
            System.out.println("Match: " + matcher.group() + " at index " + matcher.start());
            for (int i = 1; i <= matcher.groupCount(); i++) {
                if (matcher.group(i) != null) {
                    System.out.println("  Group " + i + ": " + matcher.group(i));
                }
            }
        }
    }
}`;
  return { language: 'Java', code, flagNotes };
}

function generatePython(pattern: string, flags: string): CodeGenResult {
  const { notes: flagNotes, mapped } = collectFlagNotes(PYTHON_FLAG_MAP, flags);
  const flagsStr = mapped.length > 0 ? ', ' + mapped.join(' | ') : '';
  const code = `import re

pattern = re.compile(r'${pattern}'${flagsStr})
text = 'your test string here'

for match in pattern.finditer(text):
    print(f'Match: {match.group()} at index {match.start()}')
    for name, value in match.groupdict().items():
        print(f'  Group {name}: {value}')
    for i in range(1, len(match.groups()) + 1):
        if match.group(i) is not None:
            print(f'  Group {i}: {match.group(i)}')`;
  return { language: 'Python', code, flagNotes };
}

function generateGo(pattern: string, flags: string): CodeGenResult {
  const { notes: flagNotes } = collectFlagNotes(GO_FLAG_MAP, flags);
  // Go 用内联修饰符代替标志位
  let inlineFlags = '';
  for (const f of flags) {
    const m = GO_FLAG_MAP[f];
    if (m && m.code && m.code.startsWith('(?')) {
      inlineFlags += f;
    }
  }
  const prefix = inlineFlags ? `(?${inlineFlags})` : '';
  const esc = escapeForVerbatim(pattern);
  const code = `package main

import (
\t"fmt"
\t"regexp"
)

func main() {
\ttext := "your test string here"
\tre := regexp.MustCompile(\`${prefix}${esc}\`)

\tmatches := re.FindAllStringIndex(text, -1)
\tfor _, loc := range matches {
\t\tfmt.Printf("Match: %s at index %d\\n", text[loc[0]:loc[1]], loc[0])
\t}
}`;
  return { language: 'Go', code, flagNotes };
}

function generatePHP(pattern: string, flags: string): CodeGenResult {
  const { notes: flagNotes, mapped } = collectFlagNotes(PHP_FLAG_MAP, flags);
  const escaped = pattern.replace(/\//g, '\\/');
  const phpFlags = mapped.join('');
  const code = `<?php

$pattern = '/${escaped}/${phpFlags}';
$text = 'your test string here';

if (preg_match_all($pattern, $text, $matches, PREG_SET_ORDER)) {
    foreach ($matches as $match) {
        echo "Match: " . $match[0] . "\\n";
        for ($i = 1; $i < count($match); $i++) {
            if (isset($match[$i])) {
                echo "  Group $i: " . $match[$i] . "\\n";
            }
        }
    }
}`;
  return { language: 'PHP', code, flagNotes };
}

function generateCSharp(pattern: string, flags: string): CodeGenResult {
  const { notes: flagNotes, mapped } = collectFlagNotes(CSHARP_FLAG_MAP, flags);
  const escaped = escapeForString(pattern, '"');
  const flagsStr = mapped.length > 0 ? ' | ' + mapped.join(' | ') : '';
  const code = `using System;
using System.Text.RegularExpressions;

class Program
{
    static void Main()
    {
        string text = "your test string here";
        var regex = new Regex(@"${escaped}"${flagsStr});

        foreach (Match match in regex.Matches(text))
        {
            Console.WriteLine($"Match: {match.Value} at index {match.Index}");
            for (int i = 1; i < match.Groups.Count; i++)
            {
                if (match.Groups[i].Success)
                {
                    Console.WriteLine($"  Group {i}: {match.Groups[i].Value}");
                }
            }
        }
    }
}`;
  return { language: 'C#', code, flagNotes };
}

// ── 生成器路由 ──

const GENERATORS: Record<CodeGenLanguage, (pattern: string, flags: string) => CodeGenResult> = {
  javascript: generateJS,
  java: generateJava,
  python: generatePython,
  go: generateGo,
  php: generatePHP,
  csharp: generateCSharp,
};

/** 生成目标语言代码片段 */
export function generateCode(language: CodeGenLanguage, pattern: string, flags: string): CodeGenResult {
  if (!pattern) {
    return { language: '', code: '', flagNotes: [] };
  }
  return GENERATORS[language](pattern, flags);
}
