# 为 Git Graph 做贡献

感谢您抽出宝贵时间做出贡献！

以下是一些为 vscode-git-graph 做出贡献的指南。

## 行为守则

该项目和参与其中的每个人都受 [Git Graph 行为准则的约束](CODE_OF_CONDUCT.md)。参与其中，您应该遵守此准则。请向 [mhutchie@16right.com](mailto:mhutchie@16right.com)报告不可接受的行为。

## 我该如何贡献?

### 报告错误

提出您发现的错误以帮助我们改进！

检查[未解决的错误](https://github.com/mhutchie/vscode-git-graph/issues?q=is%3Aissue+is%3Aopen+label%3A"bugs"), 以及任何准备在 [项目板](https://github.com/mhutchie/vscode-git-graph/projects/1#column-4514040) 上发布的已修复错误，看看它是否已经得到解决。如果是，请对issue竖起大拇指，如果问题作者无法提供一些详细信息，请帮助提供其他信息。

如果之前未报告该错误，请按照以下步骤操作：
1. 使用“错误报告(Bug Report)”模板提出issue。[创建错误报告](https://github.com/mhutchie/vscode-git-graph/issues/new?assignees=mhutchie&labels=bug&template=bug-report.md&title=)
2. 完成模板，提供所有必需部分的信息。
3. 点击“提交新的issue”

我们会及时回复，并尽快解决。

### 功能请求

为这个扩展推荐一个新功能！我们想让 Git Graph 成为 Visual Studio Code 中更有用的工具，因此非常感谢您提出的任何建议。

检查 [开放的功能请求](https://github.com/mhutchie/vscode-git-graph/issues?q=is%3Aissue+is%3Aopen+label%3A"feature+request")，以及任何准备在 [项目板](https://github.com/mhutchie/vscode-git-graph/projects/1#column-4514040)上发布的功能请求，看看您的想法是否已经在考虑中或正在进行中。如果是，请为该issue竖起大拇指，这样它的优先级就会更高。

如果您之前没有推荐过您的功能，请按照以下步骤操作：
1. 使用“功能请求(Feature Request)”模板提出issue。[创建功能请求](https://github.com/mhutchie/vscode-git-graph/issues/new?assignees=mhutchie&labels=feature+request&template=feature-request.md&title=)
2. 按照您认为合适的模板进行操作，它仅用作指南。
3. 点击“提交新问题(Submit new issue)”

我们会及时响应，您的请求将根据 Git Graph [问题优先级](https://github.com/mhutchie/vscode-git-graph/wiki/Issue-Prioritisation) 排序。

### 改进

建议改进此扩展的现有功能！我们想让 Git Graph 成为 Visual Studio Code 中更有用的工具，因此非常感谢您所做的任何改进。

检查 [开放的改进](https://github.com/mhutchie/vscode-git-graph/issues?q=is%3Aissue+is%3Aopen+label%3A"improvement")，以及任何准备在 [项目板](https://github.com/mhutchie/vscode-git-graph/projects/1#column-4514040)上发布的改进，看看您的改进是否已经在考虑中或正在进行中。如果是，请为该issue竖起大拇指，这样它的优先级就会更高。

如果之前没有建议您进行改进，请按照以下步骤操作：
1. 使用“改进(Improvement)”模板提出issue。[Create Improvement](https://github.com/mhutchie/vscode-git-graph/issues/new?assignees=mhutchie&labels=improvement&template=improvement.md&title=)
2. 按照您认为合适的模板进行操作，它仅用作指南。
3. 点击“提交新问题(Submit new issue)”

我们会及时响应，您的请求将根据 Git Graph [问题优先级](https://github.com/mhutchie/vscode-git-graph/wiki/Issue-Prioritisation) 排序。

### 为发展做贡献

如果您有兴趣帮助做出贡献，请执行以下任一操作:
* 找到您想要处理的打开的issue，并发表评论。一旦代码所有者回复了一些背景信息和初步想法，就会分配给您进行处理。
* 提出一个问题来描述你想做的功能，并提到您想要实现它。一旦得到代码所有者的回应，它就被确认为 Git Graph 的一个合适的特性，它将被分配给你工作。

第 1 步：设置您的开发环境，请按照以下步骤操作:
1. 如果尚未安装 [Node.js](https://nodejs.org/en/)，请安装它。
2. 在 GitHub 上克隆 [vscode-git-graph](https://github.com/mhutchie/vscode-git-graph) 仓库。
3. 在 Visual Studio Code 中打开本仓库.
4. 在 Visual Studio Code 终端中， 运行 `npm install` 以自动下载所有必需的 Node.js 依赖项。
5. 如果尚未安装 [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) 扩展，请安装它。
6. 为您将要处理的问题创建并切换一个分支。

第 2 步: 查看 [代码库大纲](https://github.com/mhutchie/vscode-git-graph/wiki/Codebase-Outline)，以便您对代码库的结构有一个大致的了解。

第 3 步: 要编译代码，请在 Visual Studio Code 终端中运行相应的 npm 脚本，如下所示:
* `npm run compile`: 编译前端和后端代码
* `npm run compile-src`: 只编译后端代码
* `npm run compile-web`: 仅编译前端代码，并进行缩小。
* `npm run compile-web-debug`: 编译前端代码，不压缩。

_注意：当您第一次打开代码库时，您需要运行 `npm run compile-src` 以使后端定义的类型可供前端使用，否则前端代码中会出现许多类型错误。同样，如果你改变了后端类型，而你也想通过GG命名空间在前端中使用它，则在使用它们之前先运行 `npm run compile-src`_

第 4 步：快速测试您的更改：
* 按 F5 会在新窗口中启动扩展开发主机，使用步骤 3 中编译的版本覆盖已安装的 Git Graph 版本。您可以:
    * 使用扩展来测试您的更改
    * 通过运行 Visual Studio Code 命令查看 Webview 开发人员工具 `Developer: Open Webview Developer Tools`。这允许您:
        * 查看前端 JavaScript 控制台
        * 查看和修改 CSS 规则（临时）
        * 查看和修改 DOM 树（临时）
        * 如果您在第 3 步中运行了 `npm run compile-web-debug` ，您还可以向已编译的前端 JavaScript 中添加断点。
* 切换回您所在的 Visual Studio Code 窗口（从第 3 步开始），您可以:
    * 向后端 TypeScript 添加断点
    * 重启扩展开发主机
    * 停止扩展开发主机

第 5 步：要对您的更改进行完整测试:
1. 如果尚未安装 Visual Studio Code 扩展 `npm install -g vsce` ，请安装它.
2. 将 `package.json` 文件中，第 4 行定义的扩展版本更改为alpha 版本，例如 `1.13.0-alpha.0`. 每次打包扩展的修改版本时，您都应该增加 alpha 版本号。_确保不要在更改时提交版本号。_
3. 在 Visual Studio Code 终端中运行 npm 脚本 `npm run package-and-install` 。这会将扩展编译并打包成一个 `vsix` 文件，然后安装它。
4. 重新启动 Visual Studio Code，并验证您是否安装了正确的 alpha 版本。
5. 测试这个扩展，它的表现与已发布的版本完全相同。

第 6 步：完成开发后提出拉取请求，我们将会查看它。

#### 样式指南

所需的样式是通过在 Visual Studio Code 中运行 "Format Document" 生成的。
