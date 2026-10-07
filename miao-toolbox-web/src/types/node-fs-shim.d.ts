/**
 * 给测试用的最小 node 模块声明。
 *
 * 为什么不为这个装 `@types/node`：
 *
 * 1. `tsconfig.app.json` 的 `types` 是**显式白名单**（当前只有 `vite/client`），
 *    装了 `@types/node` 也不会被自动包含，还得再改 tsconfig —— 为一个测试
 *    动两个配置文件不划算；
 * 2. 测试只需要「读一个文件」，不需要 node 的其它 API。
 *
 * 所以就地把这两个函数声明清楚，影响面锁在最小。
 *
 * !! 若将来真的引入 @types/node，请删掉本文件，避免与官方类型重复定义 !!
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
