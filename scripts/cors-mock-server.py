#!/usr/bin/env python3
"""CORS 验收用 mock 服务（Python 标准库，无第三方依赖）。

配合 miao-toolbox「CORS 策略检查器」验收 nt-3-9 的 C2 / C3 反例：

  /cors-deny            Allow-Origin 为具体域名（非 *）
                        -> 验收 C2：填 Origin=https://example.com，预期「不允许跨域」
  /cors-wildcard-creds  Allow-Origin: * 且 Allow-Credentials: true（浏览器禁止的非法组合）
                        -> 验收 C3：预期 high 级标红「* 与 credentials 不能共存」

正确响应 OPTIONS 预检并返回对应 CORS 响应头。CORS 检查器由服务端代发 OPTIONS，
因此这里必须处理 OPTIONS 方法。

用法：
    python3 scripts/cors-mock-server.py 9000
    # 默认监听 0.0.0.0:9000

重要（SSRF 约束）：CORS 检查器经服务端 SsrfNetworkClient 发请求，只放行公网地址，
会拦截 127.0.0.1 / localhost / 192.168.x / 10.x / 172.16-31.x 等私有与回环地址。
因此本服务必须跑在「api 服务端能从其公网 IP 访问」的位置，验收时 CORS 检查器填：
    http://<服务器公网IP>:9000/cors-deny
    http://<服务器公网IP>:9000/cors-wildcard-creds
（不能填 127.0.0.1 / 内网地址，否则会被拦截并提示「请求被拦截 / 不允许访问」）
"""
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CORS_DENY_HEADERS = {
    "Access-Control-Allow-Origin": "https://specific.example.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "false",
}

CORS_WILDCARD_CREDS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
}


class Handler(BaseHTTPRequestHandler):
    def _route(self):
        path = self.path.split("?")[0]
        if path == "/cors-deny":
            self._emit(CORS_DENY_HEADERS)
        elif path == "/cors-wildcard-creds":
            self._emit(CORS_WILDCARD_CREDS_HEADERS)
        else:
            if self.command == "OPTIONS":
                self.send_response(204)
                self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"not found")

    def _emit(self, headers):
        if self.command == "OPTIONS":
            self.send_response(204)
        else:
            self.send_response(200)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "OPTIONS":
            self.wfile.write(b"ok")

    def do_OPTIONS(self):
        self._route()

    def do_GET(self):
        self._route()

    def log_message(self, *args):  # 安静日志
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9000
    print(f"CORS mock server listening on 0.0.0.0:{port}")
    print("  C2 -> http://<host>:%d/cors-deny" % port)
    print("  C3 -> http://<host>:%d/cors-wildcard-creds" % port)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
