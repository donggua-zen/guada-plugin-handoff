"use strict";

/**
 * 任务交接插件（MVP）
 *
 * 只做一件事：注册 /handoff 命令，把一段固定的交接指令注入给当前 AI。
 * AI 收到指令后，用内置 write 工具把交接文档写到工作区根目录的 HANDOFF.md。
 *
 * 本版刻意不注册任何工具、不读写文件、不做校验/增强，先把流程跑通。
 *
 * 两条触发路径共用同一个 INSTRUCTION：
 *   1) 命令面板：registerCommandProvider 的 parse() 返回 appendix，由宿主
 *      作为 origin='system' 注入块随用户消息落库；
 *   2) 直接输入 /handoff：agent.pre_step 钩子检测最后一条真实用户消息，
 *      用 injectUserPrompt() 注入一条隐藏 user 消息。
 */

const PLUGIN_ID = "handoff";

const INSTRUCTION = `用户刚刚触发了「任务交接」命令。请基于当前完整会话，生成一份自包含的任务交接文档，供另一个没有当前对话记录的会话无缝接续工作。

消息中的 [/handoff:...] 只是命令标记，请忽略它的字面内容。

写入方式：
- 使用内置 write 工具，把完整文档写到当前工作区的 HANDOFF.md（相对路径，整文件覆盖）。
- 不要用 edit 或 run_command 拼接文件。
- 只调用一次 write，写入完整内容。
- 不要输出 YAML frontmatter。

要求：
- 假设下一个会话只能看到这份文件，看不到当前对话；所有继续工作必需的信息都要写进去。
- 保留精确的文件路径、函数名、命令、错误原文、版本号、端口、环境变量名、验收标准。
- 已完成项要附证据（执行的命令、测试结果、文件路径）；未完成项写清阻塞原因。
- 敏感信息（API Key、Token、密码、Cookie、私钥）必须脱敏为 [REDACTED]。
- 不要向用户提问；不要省略章节。
- 如果用户在命令后补充了要求，优先满足。
- 使用与用户相同的语言撰写正文。

文档结构（Markdown，必须包含以下章节）：
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

写完后，用一两句话告诉用户 HANDOFF.md 已生成，并附上相对路径；不要重复文档全文。`;

/** 取出消息里的纯文本（忽略 reasoning / tool-call / tool-result 等块） */
function extractText(message) {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter(
      (block) =>
        block && block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

class HandoffPlugin {
  constructor() {
    this.manifest = {
      id: PLUGIN_ID,
      name: "任务交接",
      version: "0.1.0",
      description: "注册 /handoff 命令，让当前 AI 生成任务交接文件 HANDOFF.md",
      author: "donggua-zen",
      category: "user",
      main: "index.js",
      apiVersion: 2,
      icon: "assets/icon.svg",
      permissions: ["prompt"],
    };
  }

  async onLoad(api) {
    this.registerCommand(api);
    this.registerTypedCommandHook(api);
  }

  /** 命令面板：输入 / 时出现「任务交接」，选中后插入 [/handoff:handoff] 标签 */
  registerCommand(api) {
    api.registerCommandProvider({
      id: PLUGIN_ID,
      trigger: "slash",
      fetchItems() {
        return [
          {
            name: "handoff",
            label: "任务交接",
            description: "让当前 AI 生成任务交接文件 HANDOFF.md",
          },
        ];
      },
      parse(attrs) {
        if (attrs && attrs.name && attrs.name !== "handoff") {
          return undefined;
        }
        return { replacement: "", appendix: INSTRUCTION };
      },
    });
  }

  /**
   * 直接输入 /handoff 的兼容路径。
   *
   * 宿主目前只对 /workflow 做了“斜杠转标签”的硬编码归一化，第三方插件
   * 无法扩展；这里用 pre_step 钩子在首次模型请求前注入同样的指令。
   *
   * 幂等：同一轮里注入过之后，历史中会出现一条 hidden + source.plugin=handoff
   * 的消息；之后每次 pre_step 都能检测到并跳过。
   */
  registerTypedCommandHook(api) {
    api.registerHook({
      event: "agent.pre_step",
      order: 900,
      handler: async (payload) => {
        try {
          const ctx = payload && payload.sessionContext;
          if (!ctx || ctx.sessionType !== "web") return;

          const history = await ctx.getHistory();
          if (!Array.isArray(history) || history.length === 0) return;

          // 最后一条“真实用户消息”（跳过插件注入的 hidden 消息）
          let lastUserIdx = -1;
          for (let i = history.length - 1; i >= 0; i -= 1) {
            const msg = history[i];
            if (
              msg &&
              msg.role === "user" &&
              !(msg.metadata && msg.metadata.hidden)
            ) {
              lastUserIdx = i;
              break;
            }
          }
          if (lastUserIdx < 0) return;

          const text = extractText(history[lastUserIdx]);
          if (!/^\s*\/handoff(?:\s|$)/i.test(text)) return;

          const alreadyInjected = history
            .slice(lastUserIdx + 1)
            .some(
              (msg) =>
                msg &&
                msg.role === "user" &&
                msg.metadata &&
                msg.metadata.hidden &&
                msg.source &&
                msg.source.plugin === PLUGIN_ID,
            );
          if (alreadyInjected) return;

          await ctx.injectUserPrompt(
            `<system_reminder>\n${INSTRUCTION}\n</system_reminder>`,
            PLUGIN_ID,
          );
        } catch (error) {
          // 钩子是增强项，失败不能打断主流程
          console.warn(
            `[handoff] pre_step hook failed: ${
              error && error.message ? error.message : error
            }`,
          );
        }
      },
    });
  }
}

module.exports = HandoffPlugin;
module.exports.default = HandoffPlugin;
