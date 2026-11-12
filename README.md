# 任务交接（Handoff）插件

注册一个 `/handoff` 命令：让当前 AI 基于完整会话生成一份任务交接文档，写到工作区根目录的 `HANDOFF.md`。用户拿着这个文件到另一个会话，即可让新会话了解任务进展并接续工作。

MVP 版只做「命令 → 注入指令 → AI 用内置 `write` 写文件」，不注册工具、不做校验/增强。

## 安装

### 插件市场（推荐）

设置 → 插件 → 市场 → 搜索「任务交接」→ 安装并启用。

安装源：

```text
github:donggua-zen/guada-plugin-handoff#main
```

也可以在「设置 → 插件 → 从来源安装」中直接粘贴上面的安装源。

`category` 为 `user`，安装后默认关闭，需要在插件列表里手动启用。

### 本地源码安装（开发）

```http
POST /api/v1/plugins/install
Content-Type: application/json

{ "source": "local:D:/AI/guada_plugins/guada-plugin-handoff" }
```

仅适用于本机开发；安装后会复制到用户插件目录（开发环境通常是 `~/.guada-dev/plugins/handoff`）。

## 使用

### 从命令面板选择

1. 在输入框输入 `/`；
2. 选择「任务交接」；
3. 可选：在命令徽标后补充要求，例如：
   ```text
   [/handoff:handoff] 重点记录数据库迁移和回滚方案
   ```
4. 发送。

> 直接输入 `/handoff` 是**刻意不支持**的：它会被当成普通文本发给 AI，不会触发交接命令。这是为了避免和普通字符串混淆，必须从 `/` 命令面板里选择命令徽标。

AI 收到指令后会调用内置 `write` 工具，把完整文档写到当前工作区的 `HANDOFF.md`，然后用一两句话告诉你文件已生成。

## 生成的文件

路径固定为：

```text
<当前工作区>/HANDOFF.md
```

文档结构（由指令约束）：

```markdown
# 任务交接：<标题>

## 1. 任务目标与当前状态
## 2. 已完成
## 3. 进行中
## 4. 待办与阻塞
## 5. 关键决策与理由
## 6. 文件与代码变更
## 7. 命令与环境
## 8. 错误与修复
## 9. 关键上下文
## 10. 下一步
## 11. 待确认问题
```

注意：每次执行会**整文件覆盖** `HANDOFF.md`。

## 在新会话接续

同一个工作区：

```text
读取 HANDOFF.md，先复述任务目标和当前状态，然后按「下一步」继续；不要重复已完成的工作。
```

不同工作区：把 `HANDOFF.md` 拖入/附加到新会话，再发送类似指令。

## 开发 / 更新

`local:` 安装会复制源码，修改源码后需要更新安装：

```http
POST /api/v1/plugins/handoff/update
POST /api/v1/plugins/reload/handoff
```

或者卸载后重新安装。

市场安装的副本 `.gd-source` 为 `github:donggua-zen/guada-plugin-handoff#main`，同样用上面的 `update` 接口拉取最新 `main`。

## 限制（MVP）

- 不做章节/长度校验，AI 可能漏章节或忘记调用 `write`。
- 依赖当前智能体启用 `file` 插件的 `write` 工具；正常 web 会话默认可用。
- 只能从 `/` 命令面板选择；直接输入 `/handoff` 会作为普通文本处理（刻意设计，避免误触发）。
- 固定写工作区根目录的 `HANDOFF.md`，会覆盖同名文件。
- 只面向本地工作区。
- 宿主现状：插件被禁用后，命令提供者仍可能出现在命令列表里；不用时建议卸载而不是仅禁用。

## 后续可加

- 在 `turn.stopping` 钩子里校验章节，不合格时强制续跑一次；
- 自动补充 frontmatter、git 环境快照、时间戳归档；
- 输出路径/语言/最大长度配置；
- 新会话 `/handoff-resume` 自动读取最新交接文件。
