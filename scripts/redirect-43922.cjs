/* global console */
// ============================================================
// 端口 43922 兼容重定向守护服务
// 当用户在浏览器中误输入 127.0.0.1:43922 时，秒级自动 302 跳转至
// 常驻测试环境 http://127.0.0.1:43921/stage/build/desktop/
// ============================================================
const http = require("http");

const server = http.createServer((req, res) => {
  const targetPath = !req.url || req.url === "/" ? "/stage/build/desktop/" : req.url;
  const target = `http://127.0.0.1:43921${targetPath}`;
  res.writeHead(302, {
    Location: target,
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${target}"></head><body>Redirecting to <a href="${target}">${target}</a>...</body></html>`);
});

server.listen(43922, "127.0.0.1", () => {
  console.log("43922 redirector listening -> http://127.0.0.1:43921/stage/build/desktop/");
});
