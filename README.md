# VS Code的Git Graph扩展

查看存储库的 Git 图表，并从图表轻松执行 Git 操作。可按你想要的方式配置！

![Recording of Git Graph](https：//github.com/mhutchie/vscode-git-graph/raw/master/resources/demo.gif)

## 特征

* Git Graph 视图：
    * 显示：
        * 本地 & 远程分支。
        * 本地分支：Heads，标签 & 远程。
        * 未提交的更改。
    * 执行 Git 操作(可通过单击右键 提交/ 分支 / 标签 获得)：
        * 创建、签出、删除、获取、合并、拉取、推送、变基、重命名和重置分支。
        * 添加，删除和推送标签。
        * 切换，Cherry Pick，丢弃，合并 & Revert(回撤）) 提交。
        * 清理，复位和存储未提交的更改。
        * 应用，创建分支，删除和弹出暂存。
        * 查看带注释的标签详情（姓名，邮箱，日期和消息）。
        * 将提交哈希值，分支，暂存和标签名称复制到剪贴板。
    * 通过单击提交查看提交详情和文件更改。在提交详情视图中你可以：
        * 通过单击查看任何文件更改的VS Code差异。
        * 打开在提交中受影响的任何文件的当前版本。
        * 将提交中受影响的任何文件的路径复制到剪贴板。
        * 单击提交正文中的任何HTTP/HTTPS地址以在你的默认web浏览器中打开它。
    * 通过单击一个提交来比较任何两个提交，然后CTRL/CMD单击另一个提交。在提交比较视图中，你可以：
        * 通过单击查看所选提交之间任何文件更改的VS Code差异
        * 打开在所选提交之间受影响的任何文件的当前版本。
        * 将所选提交之间受影响的任何文件的路径复制到剪贴板。
    * 代码审查 - 跟踪你在提交详情和比较视图中审查了哪些文件。
        * 代码审查可以在任何提交上执行，也可以在任何两次提交之间执行（而不是在未提交的更改上）。
        * 开始代码审查时，所有需要审查的文件都已粗体显示。当你查看差异/打开文件时，它将被取消粗体。
        * 代码审查在VS Code会话中持续存在。它们会在 90 天不活动后自动关闭。
    * 查看未提交的更改，并将未提交的更改与任何提交进行比较。
    * 将鼠标悬停在图表上的任何提交上方，以查看工具提示：
        * 提交是否包含在 HEAD 中。
        * 哪些分支，标签，暂存包含提交。 
    * 使用分支下拉菜单过滤 Git Graph 中显示的分支。过滤分支的选项是：
        * 显示所有分支
        * 选择要查看的一个或多个分支
        * 从用户预定义的自定义全局模式中选择（通过设置 `git-graph.customBranchGlobPatterns` ）
    * 从远程获取 _(在顶部控制栏上可用)_
    * 查找组件允许你快速找到一个或多个包含特定短语的提交Find Widget allows you to quickly find one or more commits containing a specific phrase（在提交消息 / 日期 / 作者 / 哈希值，分支或标签名称中）。
    * 仓库设置组件：
        * 允许你查看、添加、编辑、删除、获取和剪除远程的仓库。
        * 配置 "Issue链接" - 将提交消息中的issue编号转换为超链接,从而在issue跟踪系统中打开该issue。
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
    * 常见的 Emoji 表情符号简码会自动替换为提交消息中的相应 emoji 表情符号 （包括所有 [gitmoji](https：//gitmoji.carloscuesta.me/) ）. 自定义Emoji表情符号简码映射可以定义在 `git-graph.customEmojiShortcodeMappings`.
* 广泛的可配置设置（例如图形样式、颜色分支等……）。有关详细信息，请参阅下面的“扩展设置”部分。
* 状态栏中的"Git Graph" 启动按钮
* 命令面板中的"Git Graph： View Git Graph" 启动命令

## 扩展设置

Detailed information of all Git Graph settings is available [here](https：//github.com/mhutchie/vscode-git-graph/wiki/Extension-Settings)，including： descriptions，screenshots，default values and types.

A summary of the Git Graph extension settings are：
* **Commit Details View**：
    * **Auto Center**： Automatically center the Commit Details View when it is opened.
    * **File View**：
        * **File Tree**：
            * **Compact Folders**： Render the File Tree in the Commit Details View in a compacted form，such that folders with a single child folder are compressed into a single combined folder element.
        * **Type**： Sets the default type of File View used in the Commit Details View.
    * **Location**： Specifies where the Commit Details View is rendered in the Git Graph View.
* **Context Menu Actions Visibility**： Customise which context menu actions are visible. For more information，see the documentation [here](https：//github.com/mhutchie/vscode-git-graph/wiki/Extension-Settings#context-menu-actions-visibility).
* **Custom Branch Glob Patterns**： An array of Custom Glob Patterns to be shown in the "Branches" dropdown. Example： `[{"name"："Feature Requests"，"glob"："heads/feature/*"}]`
* **Custom Emoji Shortcode Mappings**： An array of custom Emoji Shortcode mappings. Example： `[{"shortcode"： "：sparkles："，"emoji"："✨"}]`
* **Custom Pull Request Providers**： An array of custom Pull Request providers that can be used in the "Pull Request Creation" Integration. For information on how to configure this setting，see the documentation [here](https：//github.com/mhutchie/vscode-git-graph/wiki/Configuring-a-custom-Pull-Request-Provider).
* **Date**：
    * **Format**： Specifies the date format to be used in the "Date" column on the Git Graph View.
    * **Type**： Specifies the date type to be displayed in the "Date" column on the Git Graph View，either the author or commit date.
* **Default Column Visibility**： An object specifying the default visibility of the Date，Author & Commit columns. Example： `{"Date"： true，"Author"： true，"Commit"： true}`
* **Dialog > \***： Set the default options on the following dialogs： Add Tag，Apply Stash，Cherry Pick，Create Branch，Delete Branch，Fetch into Local Branch，Fetch Remote，Merge，Pop Stash，Pull Branch，Rebase，Reset，and Stash Uncommitted Changes
* **Enhanced Accessibility**： Visual file change A|M|D|R|U indicators in the Commit Details View for users with colour blindness. In the future，this setting will enable any additional accessibility related features of Git Graph that aren't enabled by default.
* **File Encoding**： The character set encoding used when retrieving a specific version of repository files (e.g. in the Diff View). A list of all supported encodings can be found [here](https：//github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings).
* **Graph**：
    * **Colours**： Specifies the colours used on the graph.
    * **Style**： Specifies the style of the graph.
    * **Uncommitted Changes**： Specifies how the Uncommitted Changes are displayed on the graph.
* **Integrated Terminal Shell**： Specifies the path and filename of the Shell executable to be used by the VS Code Integrated Terminal，when it is opened by Git Graph.
* **Keyboard Shortcut > \***： Configures the keybindings used for all keyboard shortcuts in the Git Graph View.
* **Markdown**： Parse and render a frequently used subset of inline Markdown formatting rules in commit messages and tag details (bold，italics，bold & italics，and inline code blocks).
* **Max Depth Of Repo Search**： Specifies the maximum depth of subfolders to search when discovering repositories in the workspace.
* **Open New Tab Editor Group**： Specifies the Editor Group where Git Graph should open new tabs，when performing the following actions from the Git Graph View： Viewing the VS Code Diff View，Opening a File，Viewing a File at a Specific Revision.
* **Open to the Repo of the Active Text Editor Document**： Open the Git Graph View to the repository containing the active Text Editor document.
* **Reference Labels**：
    * **Alignment**： Specifies how branch and tag reference labels are aligned for each commit.
    * **Combine Local and Remote Branch Labels**： Combine local and remote branch labels if they refer to the same branch，and are on the same commit.
* **Repository**：
    * **Commits**：
        * **Fetch Avatars**： Fetch avatars of commit authors and committers.
        * **Initial Load**： Specifies the number of commits to initially load.
        * **Load More**： Specifies the number of additional commits to load when the "Load More Commits" button is pressed，or more commits are automatically loaded.
        * **Load More Automatically**： When the view has been scrolled to the bottom，automatically load more commits if they exist (instead of having to press the "Load More Commits" button).
        * **Mute**：
            * **Commits that are not ancestors of HEAD**： Display commits that aren't ancestors of the checked-out branch / commit with a muted text color.
            * **Merge Commits**： Display merge commits with a muted text color.
        * **Order**： Specifies the order of commits on the Git Graph View. See [git log](https：//git-scm.com/docs/git-log#_commit_ordering) for more information on each order option.
        * **Show Signature Status**： Show the commit's signature status to the right of the Committer in the Commit Details View (only for signed commits). Hovering over the signature icon displays a tooltip with the signature details.
    * **Fetch and Prune**： Before fetching from remote(s) using the Fetch button on the Git Graph View Control Bar，remove any remote-tracking references that no longer exist on the remote(s).
    * **Fetch And Prune Tags**： Before fetching from remote(s) using the Fetch button on the Git Graph View Control Bar，remove any local tags that no longer exist on the remote(s).
    * **Include Commits Mentioned By Reflogs**： Include commits only mentioned by reflogs in the Git Graph View (only applies when showing all branches).
    * **On Load**：
        * **Scroll To Head**： Automatically scroll the Git Graph View to be centered on the commit referenced by HEAD.
        * **Show Checked Out Branch**： Show the checked out branch when a repository is loaded in the Git Graph View.
        * **Show Specific Branches**： Show specific branches when a repository is loaded in the Git Graph View.
    * **Only Follow First Parent**： Only follow the first parent of commits when discovering the commits to load in the Git Graph View. See [--first-parent](https：//git-scm.com/docs/git-log#Documentation/git-log.txt---first-parent) to find out more about this setting.
    * **Show Commits Only Referenced By Tags**： Show Commits that are only referenced by tags in Git Graph.
    * **Show Remote Branches**： Show Remote Branches in Git Graph by default.
    * **Show Remote Heads**： Show Remote HEAD Symbolic References in Git Graph.
    * **Show Stashes**： Show Stashes in Git Graph by default.
    * **Show Tags**： Show Tags in Git Graph by default.
    * **Show Uncommitted Changes**： Show uncommitted changes. If you work on large repositories，disabling this setting can reduce the load time of the Git Graph View.
    * **Show Untracked Files**： Show untracked files when viewing the uncommitted changes. If you work on large repositories，disabling this setting can reduce the load time of the Git Graph View.
    * **Sign**：
        * **Commits**： Enables commit signing with GPG or X.509.
        * **Tags**： Enables tag signing with GPG or X.509.
    * **Use Mailmap**： Respect [.mailmap](https：//git-scm.com/docs/git-check-mailmap#_mapping_authors) files when displaying author & committer names and email addresses.
* **Repository Dropdown Order**： Specifies the order that repositories are sorted in the repository dropdown on the Git Graph View (only visible when more than one repository exists in the current VS Code Workspace).
* **Retain Context When Hidden**： Specifies if the Git Graph view VS Code context is kept when the panel is no longer visible (e.g. moved to background tab). Enabling this setting will make Git Graph load significantly faster when switching back to the Git Graph tab，however has a higher memory overhead.
* **Show Status Bar Item**： Show a Status Bar Item that opens the Git Graph View when clicked.
* **Source Code Provider Integration Location**： Specifies where the "View Git Graph" action appears on the title of SCM Providers.
* **Tab Icon Colour Theme**： Specifies the colour theme of the icon displayed on the Git Graph tab.

This extension consumes the following settings：

* `git.path`： Specifies the path and filename of a portable Git installation.

## Extension Commands

This extension contributes the following commands：

* `git-graph.view`： Git Graph： View Git Graph
* `git-graph.addGitRepository`： Git Graph： Add Git Repository... _(used to add sub-repos to Git Graph)_
* `git-graph.clearAvatarCache`： Git Graph： Clear Avatar Cache
* `git-graph.endAllWorkspaceCodeReviews`： Git Graph： End All Code Reviews in Workspace
* `git-graph.endSpecificWorkspaceCodeReview`： Git Graph： End a specific Code Review in Workspace... _(used to end a specific Code Review without having to first open it in the Git Graph View)_
* `git-graph.fetch`： Git Graph： Fetch from Remote(s) _(used to open the Git Graph View and immediately run "Fetch from Remote(s)")_
* `git-graph.removeGitRepository`： Git Graph： Remove Git Repository... _(used to remove repositories from Git Graph)_
* `git-graph.resumeWorkspaceCodeReview`： Git Graph： Resume a specific Code Review in Workspace... _(used to open the Git Graph View to a Code Review that is already in progress)_
* `git-graph.version`： Git Graph： Get Version Information

## Release Notes

Detailed Release Notes are available [here](CHANGELOG.md).

## Visual Studio Marketplace

This extension is available on the [Visual Studio Marketplace](https：//marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) for VS Code.

## Acknowledgements

Thank you to all of the contributors that help with the development of Git Graph!

Some of the icons used in Git Graph are from the following sources，please support them for their excellent work!
- [GitHub Octicons](https：//octicons.github.com/) ([License](https：//github.com/primer/octicons/blob/master/LICENSE))
- [Icons8](https：//icons8.com/icon/pack/free-icons/ios11) ([License](https：//icons8.com/license))