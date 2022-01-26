# VS Code的Git Graph扩展

查看存储库的 Git 图表，并从图表轻松执行 Git 操作。可按你想要的方式配置！

![Recording of Git Graph](https://github.com/mhutchie/vscode-git-graph/raw/master/resources/demo.gif)

## 特征

* Git Graph 视图：
    * 显示：
        * 本地 & 远程分支。
        * 本地分支：Heads，标签 & 远程。
        * 未提交的更改。
    * 执行 Git 操作(可通过单击右键 提交/ 分支 / 标签 获得)：
        * 创建、签出、删除、获取、合并、拉取、推送、变基、重命名和重置分支。
        * 添加，删除和推送标签。
        * 切换，Cherry Pick(选择提交)，丢弃，合并 & Revert(回撤) 提交。
        * 清理，复位和存储未提交的更改。
        * 应用，创建分支，删除和弹出暂存。
        * 查看带注释的标签详情（姓名，邮箱，日期和消息）。
        * 将提交哈希值，分支，暂存和标签名称复制到剪贴板。
    * 通过单击提交查看提交详情和文件更改。在提交详情视图中你可以：
        * 通过单击查看任何文件更改的 VS Code 差异。
        * 打开在提交中受影响的任何文件的当前版本。
        * 将提交中受影响的任何文件的路径复制到剪贴板。
        * 单击提交正文中的任何 HTTP/HTTPS 地址以在你的默认 Web 浏览器中打开它。
    * 通过单击一个提交来比较任何两个提交，然后 CTRL/CMD 单击另一个提交。在提交比较视图中，你可以：
        * 通过单击查看所选提交之间任何文件更改的 VS Code 差异
        * 打开在所选提交之间受影响的任何文件的当前版本。
        * 将所选提交之间受影响的任何文件的路径复制到剪贴板。
    * 代码评审 - 跟踪你在提交详情和比较视图中审查了哪些文件。
        * 代码评审可以在任何提交上执行，也可以在任何两次提交之间执行（而不是在未提交的更改上）。
        * 开始代码评审时，所有需要审查的文件都已粗体显示。当你查看差异/打开文件时，它将被取消粗体。
        * 代码评审在 VS Code 会话中持续存在。它们会在 90 天不活动后自动关闭。
    * 查看未提交的更改，并将未提交的更改与任何提交进行比较。
    * 将鼠标悬停在图表上的任何提交上方，以查看工具提示：
        * 提交是否包含在 HEAD 中。
        * 哪些分支，标签，暂存包含提交。 
    * 使用分支下拉菜单过滤 Git Graph 中显示的分支。过滤分支的选项是：
        * 显示所有分支
        * 选择要查看的一个或多个分支
        * 从用户预定义的自定义全局模式中选择（通过设置 `git-graph.customBranchGlobPatterns` ）
    * 从远程获取 _(在顶部控制栏上可用)_
    * 查找组件允许你快速找到一个或多个包含特定短语的提交（在提交消息 / 日期 / 作者 / 哈希值，分支或标签名称中）。
    * 仓库设置组件：
        * 允许你查看、添加、编辑、删除、获取和剪除远程的仓库。
        * 配置 " issue 链接" - 将提交消息中的 issue 编号转换为超链接,从而在 issue 跟踪系统中打开该 issue。
        * 配置"Pull Request Creation" - 直接从分支上下文菜单中自动打开和预填写拉取请求表单。
            * 内置对公共托管的 Bitbucket，GitHub 和 GitLab 拉取请求提供程序的支持。
            * 自定义拉取请求提供者可以使用扩展设置 `git-graph.customPullRequestProviders` 进行配置（例如，与私有托管的拉取请求提供者一起使用）。[此处](https://github.com/mhutchie/vscode-git-graph/wiki/Configuring-a-custom-Pull-Request-Provider)提供了有关如何配置自定义提供者程序的信息。
        * 将你的 Git Graph 仓库配置导出到可以在仓库中提交的文件。它允许在同一仓库中工作的其他人自动使用相同的 Git Graph 配置。        
    * 键盘快捷键 (在 Git Graph 视图中可用)：
        * `CTRL/CMD + F`：打开查找组件.
        * `CTRL/CMD + H`：滚动 Git Graph 视图，使其以 HEAD 引用的提交为中心。
        * `CTRL/CMD + R`：刷新 Git Graph 视图。
        * `CTRL/CMD + S`：将 Git Graph 视图滚动到加载的提交中的第一个(或下一个)暂存。
        * `CTRL/CMD + SHIFT + S`：将 Git Graph 视图滚动到加载的提交中的最后一个(或上一个)暂存。
        * 当提交详情视图在提交中打开时：
            * `Up` / `Down`：提交详情视图将在 Git Graph 视图中直接在其上方或下方的提交中打开。
            * `CTRL/CMD + Up` / `CTRL/CMD + Down`： 提交详情视图将在同一分支上的子提交或父提交上打开。
                * 如果还按下了Shift键（即 `CTRL/CMD + SHIFT + Up` / `CTRL/CMD + SHIFT + Down` ），当遇到分支或合并时，将遵循替代分支。
        * `Enter`：如果对话框打开，按回车键提交对话，执行主要操作。
        * `Escape`：关闭活动对话框，上下文菜单或提交详情视图。
    * 调整每列的宽度，并显示/隐藏日期、作者和提交列。
    * 常见的 Emoji 表情简码会自动替换为提交消息中的相应 emoji 表情符号 （包括所有 [gitmoji](https://gitmoji.carloscuesta.me/) ）. 自定义 Emoji 表情简码映射可以定义在 `git-graph.customEmojiShortcodeMappings`.
* 广泛的可配置设置（例如图形样式、颜色分支等……）。有关详细信息，请参阅下面的“扩展设置”部分。
* 状态栏中的"Git Graph" 启动按钮
* 命令面板中的"Git Graph：View Git Graph" 启动命令

## 扩展设置

所有的Git Graph 设置的详细信息都可以在[这里](https://github.com/mhutchie/vscode-git-graph/wiki/Extension-Settings)找到，包括：描述、截图、默认值和类型。

Git Graph 扩展设置总结如下：
* **提交详情视图**：
    * **自动居中**：提交详情视图打开时自动居中。
    * **文件查看**：
        * **文件树**：
            * **压缩文件夹**：在提交详情视图中以压缩形式呈现文件树，这样具有单个子文件夹的文件夹被压缩为单个组合文件夹元素。
        * **类型**：设置在提交详情视图中使用的文件视图的默认类型。
    * **位置**：指定提交详情视图在 Git Graph 视图中的渲染位置.
* **上下文菜单操作可见性**：自定义那些上下文菜单操作可见。有关详细信息，请参阅 [此处](https://github.com/mhutchie/vscode-git-graph/wiki/Extension-Settings#context-menu-actions-visibility) 的文档。
* **自定义分支全局模式**：要在“分支”下拉列表中显示自定义的全局模式数组。例如：`[{"name"："Feature Requests"，"glob"："heads/feature/*"}]`
* **自定义Emoji表情符号简码映射**： 自定义Emoji表情简码映射数组。 例如：`[{"shortcode"： "：sparkles："，"emoji"："✨"}]`
* **自定义拉取请求提供者**： 一组自定义的拉取请求提供者，可以在 "Pull Request Creation" 集成中使用。有关如何配置此设置的信息，请参阅 [此处](https://github.com/mhutchie/vscode-git-graph/wiki/Configuring-a-custom-Pull-Request-Provider) 的文档。
* **日期**：
    * **格式**： 指定在 Git Graph 视图的“日期”列中使用的日期格式。
    * **类型**： 指定在 Git Graph 视图的“日期”列中显示的日期类型，可以是作者日期，也可以是提交日期。
* **默认列可见性**：一个对象，指定日期，作者，提交列的默认可见性。例如：`{"Date"： true，"Author"： true，"Commit"： true}`
* **对话框 > \***：在以下对话框中设置默认选项：添加标签，应用暂存，Cherry Pick(选择提交)，创建分支，删除分支，获取本地分支，获取远程源，合并，弹出暂存，拉取分支，Rebase(变基)，回撤，暂存未提交的更改。
* **增强可访问性**：提交详情视图中的视觉文件更改 A|M|D|R|U 指示器，适用于色盲用户。将来，此设置将启用任何其他可访问的 Git Graph 的功能，默认情况下未启用。
* **文件编码**：检索指定版本的仓库文件时使用的字符集编码（例如：在差异视图中）。可以在 [此处](https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings) 找到所有支持的编码列表。
* **Graph**：
    * **颜色**：指定图形使用的颜色。
    * **样式**：指定图形的样式。
    * **未提交的更改**：指定未提交的更改在图形中的显方式。
* **集成终端shell**：指定 VS Code 集成终端使用的Shell可执行文件的路径和文件名，当它被 Git Graph打开时。
* **键盘快捷键 > \***：配置用于 Git Graph 视图中所有键盘快捷键的键绑定。
* **Markdown**：在提交消息和标签详细信息（粗体，斜体，粗斜体和内联代码块）中解析和呈现常用的内联 Markdown 格式规则子集。
* **仓库搜索的最大深度**：指定在工作区中发现仓库时要搜索的子文件夹的最大深度。
* **打开新选项卡编辑器组**：指定 Git Graph 应该打开新选项卡的编辑器组，当从 Git Graph 视图执行以下操作时：查看 VS Code 差异视图，打开文件，查看特定版本的文件。
* **打开活动文本编辑器文档到仓库**：打开 Git Graph 视图到包含活动文本编辑器文档的仓库。
* **参考标签**：
    * **对齐方式**：指定每次提交的分支和标签引用标签如何对齐。
    * **合并本地和远程分支标签**：合并本地和远程分支标签，如果它们引用同一个分支，并且在同一个提交上。
* **仓库**：
    * **提交**：
        * **获取头像**：获取提交作者和提交者的头像。
        * **初始加载**：指定初始加载的提交次数。
        * **加载更多**：指定按下"加载更多提交"按钮时要加载的附加提交数，或自动加载更多提交。
        * **自动加载更多**：当视图滚动到底部时，自动加载更多提交（如果它们存在）（而不是必须按下"加载更多提交"按钮）。
        * **以柔和的方式显示**：
            * **非 HEAD祖先的提交**：以柔和的文本颜色显示不是切换分支/提交的祖先的提交。
            * **Merge Commits**：以柔和的文本颜色显示合并提交。
        * **排序**： 在 Git Graph 视图中指定提交的顺序。有关每个排序选项的更多信息，请参阅 [git log](https://git-scm.com/docs/git-log#_commit_ordering)。
        * **显示签名状态**：在提交详情视图的提交者右侧显示提交的签名状态（仅适用于已签名的提交）。将鼠标悬停在签名图标上会显示带有签名详细信息的工具提示。
    * **获取和剪除**：在使用 Git Graph 视图控制栏上的获取按钮从远程获取之前，删除远程上不再存在的所有远程跟踪引用。
    * **获取和剪除标签**：在使用 Git Graph 视图控制栏上的获取按钮从远程获取之前，删除远程上不再存在的任何本地标签。
    * **包括Reflogs提到的提交**：包含仅在 Git Graph 视图中的 reflogs 提及的提交（仅在显示所有分支时适用）。
    * **加载**：
        * **滚动到顶部**：自动滚动 Git Graph 视图，使其以 HEAD 引用的提交为中心。
        * **显示切换分支**：在 Git Graph 视图中显示加载仓库时切换的分支。
        * **显示特定的分支**：在 Git Graph 视图中加载仓库时显示特定的分支。
    * **只跟随第一个父节点**：在 Git Graph 视图中发现要加载提交时，只关注提交的第一个父节点。请参阅 [--first-parent](https://git-scm.com/docs/git-log#Documentation/git-log.txt---first-parent) 以了解有关此设置的更多信息。
    * **显示只由标签引用的提交**：显示 Git Graph 中只被标签引用的提交
    * **显示远程分支**：在 Git Graph 中默认显示远程分支。
    * **显示远程 Heads**：在 Git Graph 中显示远程 HEAD 符号引用。
    * **显示暂存**：在 Git Graph 中默认显示暂存。
    * **显示标签**：在 Git Graph 中默认显示标签。
    * **Show Uncommitted Changes**：显示未提交的更改。如果您在大型存储库上工作，禁用此设置可以减少 Git Graph 视图的加载时间。
    * **Show Untracked Files**：在查看未提交的更改时显示未跟踪的文件。如果您在大型存储库上工作，禁用此设置可以减少 Git Graph 视图的加载时间。
    * **签名**：
        * **提交**：启用 GPG 或 X.509 的提交签名。
        * **标签**：使用 GPG 或 X.509 启用标签签名。
    * **Use Mailmap**：在显示作者和提交者姓名和电子邮件地址时尊重 [.mailmap](https://git-scm.com/docs/git-check-mailmap#_mapping_authors) 文件。
* **仓库下拉顺序**：指定仓库在 Git Graph 视图的仓库下拉列表中的排序顺序（仅当当前 VS Code 工作区中存在多个仓库时可见）。
* **隐藏时保留背景**：指定当面板不再可见时是否保留 Git Graph 视图 VS Code 上下文（例如移到背景选项卡）。启用此设置将使 Git Graph 在切换回 Git Graph 选项卡时加载速度明显加快，但内存开销更高。
* **显示状态栏项目**：显示一个状态栏项目，点击后会打开 Git Graph 视图。
* **源代码提供程序集成位置**：指定“View Git Graph”操作出现在 SCM 提供程序标题上的位置。
* **标签图标颜色主题**：指定在 Git Graph 选项卡上显示的图标的颜色主题。

此扩展使用以下设置：

* `git.path`：指定可移植 Git 安装的路径和文件名。

## 扩展命令

这个扩展提供了以下命令：

* `git-graph.view`： Git Graph： 查看 Git Graph
* `git-graph.addGitRepository`： Git Graph： 添加 Git 仓库... _(用于向 Git Graph 添加子仓库)_
* `git-graph.clearAvatarCache`： Git Graph： 清除头像缓存
* `git-graph.endAllWorkspaceCodeReviews`： Git Graph： 结束工作区中的所有代码评审
* `git-graph.endSpecificWorkspaceCodeReview`： Git Graph： 在工作区中结束特定的代码评审... _(用于结束特定的代码评审，而不必首先在 Git Graph 视图中打开它)_
* `git-graph.fetch`： Git Graph： 从远程源获取 _(用于打开 Git Graph 视图并立即运行 "Fetch from Remote (s)")_
* `git-graph.removeGitRepository`： Git Graph： Remove Git Repository... _(用于从 Git Graph 中移除仓库)_
* `git-graph.resumeWorkspaceCodeReview`： Git Graph： 在工作区中恢复一个特定的代码复查... _(用于打开 Git Graph View 以查看正在进行的代码复查)_
* `git-graph.version`： Git Graph： 获取版本信息

## Release Notes

详细的发行说明可在 [此处](CHANGELOG.md) 获得.

## Visual Studio 市场

此扩展可在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) 上获得.

## 致谢

感谢所有帮助开发 Git Graph 的贡献者！

在 Git Graph 中使用的部分图标出自以下来源，请支持它们的出色工作！
- [GitHub Octicons](https://octicons.github.com/) ([许可证](https://github.com/primer/octicons/blob/master/LICENSE))
- [Icons8](https://icons8.com/icon/pack/free-icons/ios11) ([许可证](https://icons8.com/license))