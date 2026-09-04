# mhtml-viewer

在手机浏览器里查看 MHTML（.mht / .mhtml）网页存档的本地小工具。

Android 上的 Chrome 内核浏览器基本打不开 `.mhtml` 单文件网页存档（`file://` + `message/rfc822` 会被拒），传到手机上的存档页面没法看。本项目用一个纯前端解析器 + Termux 本地小服务解决这个问题：

- **index.html** — 查看器本体，纯前端，零依赖。内置 MIME 多段解析、quoted-printable / base64 解码、`Content-Location` 与 `cid:` 资源映射，把存档里的 HTML / CSS / 图片重写成 blob URL 后在 sandbox iframe 中渲染
- **server.js** — 无依赖的 node 静态服务器（仅用于让浏览器以 `http://` 打开查看器）
- **start.sh** — 一键启动 / 停止 / 打开浏览器，带 pidfile 管理与 Termux wake-lock
- **sample.mht** — 测试用示例存档

## 支持的格式

- `.mht` / `.mhtml` — 浏览器「另存为 → 单文件网页」存档
- `.eml` — 邮件（MIME multipart 同理）
- `.html` / `.htm` / `.xhtml` — 普通网页（自动探测 charset，含 gb18030）
- `.txt` / `.log` / `.json` / `.csv` — 按纯文本展示

不支持 Safari 的 `.webarchive` 格式（会给出提示）。

## 快速开始（Termux）

```sh
pkg install nodejs
git clone https://github.com/Linyesantan/mhtml-viewer.git ~/mhtml-viewer
~/mhtml-viewer/start.sh
```

启动后会自动调起浏览器打开 `http://127.0.0.1:8080/`，选择或拖入 `.mht` 文件即可查看。

### webl 快捷命令

把仓库里的快捷命令装进 `$PREFIX/bin`：

```sh
cp ~/mhtml-viewer/bin/webl $PREFIX/bin/webl && chmod +x $PREFIX/bin/webl
```

之后任意目录直接：

```sh
webl          # 启动服务并打开浏览器
webl stop     # 停止
webl status   # 查看状态
webl open     # 再次打开浏览器
webl restart
```

换端口：`PORT=9000 webl`。

## 桌面浏览器也能用

`index.html` 是纯静态页面，解析全部在浏览器端完成，桌面浏览器直接双击打开（或 `node server.js` 后访问）即可使用，无需任何构建步骤。

## 测试

```sh
cd test
npm install
npm test
```

- `run-test.mjs` — 纯 node 校验解析核心（boundary 切分、QP/base64 解码、资源 URL/CID 映射、CSS 重写等）
- `run-view-test.mjs` — 用 linkedom 模拟 DOM，校验完整存档渲染流程

## 安全说明

- 渲染使用 sandbox iframe，**默认不执行存档内脚本**；工具栏的「启用脚本」开关会以 `allow-scripts` 放行，页面均来自本地文件，启用前请自行确认存档来源可信
- 存档内的 `meta refresh` / CSP 等 http-equiv 会被剔除，避免跳转干扰
- server.js 只做静态文件服务，带路径穿越防护，仅建议在本地使用

## License

[MIT](LICENSE)
