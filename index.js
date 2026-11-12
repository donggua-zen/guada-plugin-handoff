"use strict";

/**
 * 任务交接插件（MVP）
 *
 * 只做一件事：在 / 命令面板注册「任务交接」，把一段固定的交接指令注入给当前 AI。
 * AI 收到指令后，用内置 write 工具把交接文档写到工作区根目录的 HANDOFF.md。
 *
 * 触发方式只有命令面板：
 *   registerCommandProvider 的 parse() 返回 appendix，由宿主作为 origin='system'
 *   注入块随用户消息落库。
 *
 * 直接输入 /handoff 是刻意不支持的：它会被当作普通文本，避免和普通字符串混淆。
 *
 * 本版刻意不注册任何工具、不读写文件、不做校验/增强，先把流程跑通。
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

class HandoffPlugin {
  constructor() {
    this.manifest = {
      id: PLUGIN_ID,
      name: "任务交接",
      version: "0.1.1",
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
}

module.exports = HandoffPlugin;
module.exports.default = HandoffPlugin;
