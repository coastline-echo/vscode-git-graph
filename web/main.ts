class GitGraphView {
	private gitRepos: GG.GitRepoSet;
	private gitBranches: ReadonlyArray<string> = [];
	private gitBranchHead: string | null = null;
	private gitConfig: GG.GitRepoConfig | null = null;
	private gitRemotes: ReadonlyArray<string> = [];
	private gitStashes: ReadonlyArray<GG.GitStash> = [];
	private gitTags: ReadonlyArray<string> = [];
	private commits: GG.GitCommit[] = [];
	private commitHead: string | null = null;
	private commitLookup: { [hash: string]: number } = {};
	private onlyFollowFirstParent: boolean = false;
	private avatars: AvatarImageCollection = {};
	private currentBranches: string[] | null = null;

	private currentRepo!: string;
	private currentRepoLoading: boolean = true;
	private currentRepoRefreshState: {
		inProgress: boolean;
		hard: boolean;
		loadRepoInfoRefreshId: number;
		loadCommitsRefreshId: number;
		repoInfoChanges: boolean;
		configChanges: boolean;
		requestingRepoInfo: boolean;
		requestingConfig: boolean;
	};
	private loadViewTo: GG.LoadGitGraphViewTo = null;

	private readonly graph: Graph;
	private readonly config: Config;

	private moreCommitsAvailable: boolean = false;
	private expandedCommit: ExpandedCommit | null = null;
	private maxCommits: number;
	private scrollTop = 0;
	private renderedGitBranchHead: string | null = null;

	private lastScrollToStash: {
		time: number,
		hash: string | null
	} = { time: 0, hash: null };

	private readonly findWidget: FindWidget;
	private readonly settingsWidget: SettingsWidget;
	private readonly repoDropdown: Dropdown;
	private readonly branchDropdown: Dropdown;

	private readonly viewElem: HTMLElement;
	private readonly controlsElem: HTMLElement;
	private readonly tableElem: HTMLElement;
	private readonly footerElem: HTMLElement;
	private readonly showRemoteBranchesElem: HTMLInputElement;
	private readonly refreshBtnElem: HTMLElement;
	private readonly scrollShadowElem: HTMLElement;

	constructor(viewElem: HTMLElement, prevState: WebViewState | null) {
		this.gitRepos = initialState.repos;
		this.config = initialState.config;
		this.maxCommits = this.config.initialLoadCommits;
		this.viewElem = viewElem;
		this.currentRepoRefreshState = {
			inProgress: false,
			hard: true,
			loadRepoInfoRefreshId: initialState.loadRepoInfoRefreshId,
			loadCommitsRefreshId: initialState.loadCommitsRefreshId,
			repoInfoChanges: false,
			configChanges: false,
			requestingRepoInfo: false,
			requestingConfig: false
		};

		this.controlsElem = document.getElementById('controls')!;
		this.tableElem = document.getElementById('commitTable')!;
		this.footerElem = document.getElementById('footer')!;
		this.scrollShadowElem = <HTMLInputElement>document.getElementById('scrollShadow')!;

		viewElem.focus();

		this.graph = new Graph('commitGraph', viewElem, this.config.graph, this.config.mute);

		this.repoDropdown = new Dropdown('repoDropdown', true, false, 'Repos', (values) => {
			this.loadRepo(values[0]);
		});

		this.branchDropdown = new Dropdown('branchDropdown', false, true, 'Branches', (values) => {
			this.currentBranches = values;
			this.maxCommits = this.config.initialLoadCommits;
			this.saveState();
			this.clearCommits();
			this.requestLoadRepoInfoAndCommits(true, true);
		});

		this.showRemoteBranchesElem = <HTMLInputElement>document.getElementById('showRemoteBranchesCheckbox')!;
		this.showRemoteBranchesElem.addEventListener('change', () => {
			this.saveRepoStateValue(this.currentRepo, 'showRemoteBranchesV2', this.showRemoteBranchesElem.checked ? GG.BooleanOverride.Enabled : GG.BooleanOverride.Disabled);
			this.refresh(true);
		});

		this.refreshBtnElem = document.getElementById('refreshBtn')!;
		this.refreshBtnElem.addEventListener('click', () => {
			if (!this.refreshBtnElem.classList.contains(CLASS_REFRESHING)) {
				this.refresh(true, true);
			}
		});
		this.renderRefreshButton();

		this.findWidget = new FindWidget(this);
		this.settingsWidget = new SettingsWidget(this);

		alterClass(document.body, CLASS_BRANCH_LABELS_ALIGNED_TO_GRAPH, this.config.referenceLabels.branchLabelsAlignedToGraph);
		alterClass(document.body, CLASS_TAG_LABELS_RIGHT_ALIGNED, this.config.referenceLabels.tagLabelsOnRight);

		this.observeWindowSizeChanges();
		this.observeWebviewStyleChanges();
		this.observeViewScroll();
		this.observeKeyboardEvents();
		this.observeUrls();
		this.observeTableEvents();

		if (prevState && !prevState.currentRepoLoading && typeof this.gitRepos[prevState.currentRepo] !== 'undefined') {
			this.currentRepo = prevState.currentRepo;
			this.currentBranches = prevState.currentBranches;
			this.maxCommits = prevState.maxCommits;
			this.expandedCommit = prevState.expandedCommit;
			this.avatars = prevState.avatars;
			this.gitConfig = prevState.gitConfig;
			this.loadRepoInfo(prevState.gitBranches, prevState.gitBranchHead, prevState.gitRemotes, prevState.gitStashes, true);
			this.loadCommits(prevState.commits, prevState.commitHead, prevState.gitTags, prevState.moreCommitsAvailable, prevState.onlyFollowFirstParent);
			this.findWidget.restoreState(prevState.findWidget);
			this.settingsWidget.restoreState(prevState.settingsWidget);
			this.showRemoteBranchesElem.checked = getShowRemoteBranches(this.gitRepos[prevState.currentRepo].showRemoteBranchesV2);
		}

		let loadViewTo = initialState.loadViewTo;
		if (loadViewTo === null && prevState && prevState.currentRepoLoading && typeof prevState.currentRepo !== 'undefined') {
			loadViewTo = { repo: prevState.currentRepo };
		}

		if (!this.loadRepos(this.gitRepos, initialState.lastActiveRepo, loadViewTo)) {
			if (prevState) {
				this.scrollTop = prevState.scrollTop;
				this.viewElem.scroll(0, this.scrollTop);
			}
			this.requestLoadRepoInfoAndCommits(false, false);
		}

		const fetchBtn = document.getElementById('fetchBtn')!, findBtn = document.getElementById('findBtn')!, settingsBtn = document.getElementById('settingsBtn')!, terminalBtn = document.getElementById('terminalBtn')!;
		fetchBtn.title = '从远程' + (this.config.fetchAndPrune ? ' & 剪除' : '') + '获取';
		fetchBtn.innerHTML = SVG_ICONS.download;
		fetchBtn.addEventListener('click', () => this.fetchFromRemotesAction());
		findBtn.innerHTML = SVG_ICONS.search;
		findBtn.addEventListener('click', () => this.findWidget.show(true));
		settingsBtn.innerHTML = SVG_ICONS.gear;
		settingsBtn.addEventListener('click', () => this.settingsWidget.show(this.currentRepo));
		terminalBtn.innerHTML = SVG_ICONS.terminal;
		terminalBtn.addEventListener('click', () => {
			runAction({
				command: 'openTerminal',
				repo: this.currentRepo,
				name: this.gitRepos[this.currentRepo].name || getRepoName(this.currentRepo)
			}, '打开终端');
		});
	}


	/* Loading Data */

	public loadRepos(repos: GG.GitRepoSet, lastActiveRepo: string | null, loadViewTo: GG.LoadGitGraphViewTo) {
		this.gitRepos = repos;
		this.saveState();

		let newRepo: string;
		if (loadViewTo !== null && this.currentRepo !== loadViewTo.repo && typeof repos[loadViewTo.repo] !== 'undefined') {
			newRepo = loadViewTo.repo;
		} else if (typeof repos[this.currentRepo] === 'undefined') {
			newRepo = lastActiveRepo !== null && typeof repos[lastActiveRepo] !== 'undefined'
				? lastActiveRepo
				: getSortedRepositoryPaths(repos, this.config.repoDropdownOrder)[0];
		} else {
			newRepo = this.currentRepo;
		}

		alterClass(this.controlsElem, 'singleRepo', Object.keys(repos).length === 1);
		this.renderRepoDropdownOptions(newRepo);

		if (loadViewTo !== null) {
			if (loadViewTo.repo === newRepo) {
				this.loadViewTo = loadViewTo;
			} else {
				this.loadViewTo = null;
				showErrorMessage('无法加载 "' + loadViewTo.repo + '" 仓库的Git Graph视图。它目前还没有包含在Git Graph中');
			}
		} else {
			this.loadViewTo = null;
		}

		if (this.currentRepo !== newRepo) {
			this.loadRepo(newRepo);
			return true;
		} else {
			this.finaliseRepoLoad(false);
			return false;
		}
	}

	private loadRepo(repo: string) {
		this.currentRepo = repo;
		this.currentRepoLoading = true;
		this.showRemoteBranchesElem.checked = getShowRemoteBranches(this.gitRepos[this.currentRepo].showRemoteBranchesV2);
		this.maxCommits = this.config.initialLoadCommits;
		this.gitConfig = null;
		this.gitRemotes = [];
		this.gitStashes = [];
		this.gitTags = [];
		this.currentBranches = null;
		this.renderFetchButton();
		this.closeCommitDetails(false);
		this.settingsWidget.close();
		this.saveState();
		this.refresh(true);
	}

	private loadRepoInfo(branchOptions: ReadonlyArray<string>, branchHead: string | null, remotes: ReadonlyArray<string>, stashes: ReadonlyArray<GG.GitStash>, isRepo: boolean) {
		// Changes to this.gitStashes are reflected as changes to the commits when loadCommits is run
		this.gitStashes = stashes;

		if (!isRepo || (!this.currentRepoRefreshState.hard && arraysStrictlyEqual(this.gitBranches, branchOptions) && this.gitBranchHead === branchHead && arraysStrictlyEqual(this.gitRemotes, remotes))) {
			this.saveState();
			this.finaliseLoadRepoInfo(false, isRepo);
			return;
		}

		// Changes to these properties must be indicated as a repository info change
		this.gitBranches = branchOptions;
		this.gitBranchHead = branchHead;
		this.gitRemotes = remotes;

		// Update the state of the fetch button
		this.renderFetchButton();

		// Configure current branches
		if (this.currentBranches !== null && !(this.currentBranches.length === 1 && this.currentBranches[0] === SHOW_ALL_BRANCHES)) {
			// Filter any branches that are currently selected, but no longer exist
			const globPatterns = this.config.customBranchGlobPatterns.map((pattern) => pattern.glob);
			this.currentBranches = this.currentBranches.filter((branch) =>
				this.gitBranches.includes(branch) || globPatterns.includes(branch)
			);
		}
		if (this.currentBranches === null || this.currentBranches.length === 0) {
			// No branches are currently selected
			const onRepoLoadShowCheckedOutBranch = getOnRepoLoadShowCheckedOutBranch(this.gitRepos[this.currentRepo].onRepoLoadShowCheckedOutBranch);
			const onRepoLoadShowSpecificBranches = getOnRepoLoadShowSpecificBranches(this.gitRepos[this.currentRepo].onRepoLoadShowSpecificBranches);
			this.currentBranches = [];
			if (onRepoLoadShowSpecificBranches.length > 0) {
				// Show specific branches if they exist in the repository
				const globPatterns = this.config.customBranchGlobPatterns.map((pattern) => pattern.glob);
				this.currentBranches.push(...onRepoLoadShowSpecificBranches.filter((branch) =>
					this.gitBranches.includes(branch) || globPatterns.includes(branch)
				));
			}
			if (onRepoLoadShowCheckedOutBranch && this.gitBranchHead !== null && !this.currentBranches.includes(this.gitBranchHead)) {
				// Show the checked-out branch, and it hasn't already been added as a specific branch
				this.currentBranches.push(this.gitBranchHead);
			}
			if (this.currentBranches.length === 0) {
				this.currentBranches.push(SHOW_ALL_BRANCHES);
			}
		}

		this.saveState();

		// Set up branch dropdown options
		this.branchDropdown.setOptions(this.getBranchOptions(true), this.currentBranches);

		// Remove hidden remotes that no longer exist
		let hiddenRemotes = this.gitRepos[this.currentRepo].hideRemotes;
		let hideRemotes = hiddenRemotes.filter((hiddenRemote) => remotes.includes(hiddenRemote));
		if (hiddenRemotes.length !== hideRemotes.length) {
			this.saveRepoStateValue(this.currentRepo, 'hideRemotes', hideRemotes);
		}

		this.finaliseLoadRepoInfo(true, isRepo);
	}

	private finaliseLoadRepoInfo(repoInfoChanges: boolean, isRepo: boolean) {
		const refreshState = this.currentRepoRefreshState;
		if (refreshState.inProgress) {
			if (isRepo) {
				refreshState.repoInfoChanges = refreshState.repoInfoChanges || repoInfoChanges;
				refreshState.requestingRepoInfo = false;
				this.requestLoadCommits();
			} else {
				dialog.closeActionRunning();
				refreshState.inProgress = false;
				this.loadViewTo = null;
				this.renderRefreshButton();
				sendMessage({ command: 'loadRepos', check: true });
			}
		}
	}

	private loadCommits(commits: GG.GitCommit[], commitHead: string | null, tags: ReadonlyArray<string>, moreAvailable: boolean, onlyFollowFirstParent: boolean) {
		// This list of tags is just used to provide additional information in the dialogs. Tag information included in commits is used for all other purposes (e.g. rendering, context menus)
		const tagsChanged = !arraysStrictlyEqual(this.gitTags, tags);
		this.gitTags = tags;

		if (!this.currentRepoLoading && !this.currentRepoRefreshState.hard && this.moreCommitsAvailable === moreAvailable && this.onlyFollowFirstParent === onlyFollowFirstParent && this.commitHead === commitHead && commits.length > 0 && arraysEqual(this.commits, commits, (a, b) =>
			a.hash === b.hash &&
			arraysStrictlyEqual(a.heads, b.heads) &&
			arraysEqual(a.tags, b.tags, (a, b) => a.name === b.name && a.annotated === b.annotated) &&
			arraysEqual(a.remotes, b.remotes, (a, b) => a.name === b.name && a.remote === b.remote) &&
			arraysStrictlyEqual(a.parents, b.parents) &&
			((a.stash === null && b.stash === null) || (a.stash !== null && b.stash !== null && a.stash.selector === b.stash.selector))
		) && this.renderedGitBranchHead === this.gitBranchHead) {

			if (this.commits[0].hash === UNCOMMITTED) {
				this.commits[0] = commits[0];
				this.saveState();
				this.renderUncommittedChanges();
				if (this.expandedCommit !== null && this.expandedCommit.commitElem !== null) {
					if (this.expandedCommit.compareWithHash === null) {
						// Commit Details View is open
						if (this.expandedCommit.commitHash === UNCOMMITTED) {
							this.requestCommitDetails(this.expandedCommit.commitHash, true);
						}
					} else {
						// Commit Comparison is open
						if (this.expandedCommit.compareWithElem !== null && (this.expandedCommit.commitHash === UNCOMMITTED || this.expandedCommit.compareWithHash === UNCOMMITTED)) {
							this.requestCommitComparison(this.expandedCommit.commitHash, this.expandedCommit.compareWithHash, true);
						}
					}
				}
			} else if (tagsChanged) {
				this.saveState();
			}
			this.finaliseLoadCommits();
			return;
		}

		const currentRepoLoading = this.currentRepoLoading;
		this.currentRepoLoading = false;
		this.moreCommitsAvailable = moreAvailable;
		this.onlyFollowFirstParent = onlyFollowFirstParent;
		this.commits = commits;
		this.commitHead = commitHead;
		this.commitLookup = {};

		let i: number, expandedCommitVisible = false, expandedCompareWithCommitVisible = false, avatarsNeeded: { [email: string]: string[] } = {}, commit;
		for (i = 0; i < this.commits.length; i++) {
			commit = this.commits[i];
			this.commitLookup[commit.hash] = i;
			if (this.expandedCommit !== null) {
				if (this.expandedCommit.commitHash === commit.hash) {
					expandedCommitVisible = true;
				} else if (this.expandedCommit.compareWithHash === commit.hash) {
					expandedCompareWithCommitVisible = true;
				}
			}
			if (this.config.fetchAvatars && typeof this.avatars[commit.email] !== 'string' && commit.email !== '') {
				if (typeof avatarsNeeded[commit.email] === 'undefined') {
					avatarsNeeded[commit.email] = [commit.hash];
				} else {
					avatarsNeeded[commit.email].push(commit.hash);
				}
			}
		}

		if (this.expandedCommit !== null && (!expandedCommitVisible || (this.expandedCommit.compareWithHash !== null && !expandedCompareWithCommitVisible))) {
			this.closeCommitDetails(false);
		}

		this.saveState();

		this.graph.loadCommits(this.commits, this.commitHead, this.commitLookup, this.onlyFollowFirstParent);
		this.render();

		if (currentRepoLoading && this.config.onRepoLoad.scrollToHead && this.commitHead !== null) {
			this.scrollToCommit(this.commitHead, true);
		}

		this.finaliseLoadCommits();
		this.requestAvatars(avatarsNeeded);
	}

	private finaliseLoadCommits() {
		const refreshState = this.currentRepoRefreshState;
		if (refreshState.inProgress) {
			dialog.closeActionRunning();

			if (dialog.isTargetDynamicSource()) {
				if (refreshState.repoInfoChanges) {
					dialog.close();
				} else {
					dialog.refresh(this.getCommits());
				}
			}

			if (contextMenu.isTargetDynamicSource()) {
				if (refreshState.repoInfoChanges) {
					contextMenu.close();
				} else {
					contextMenu.refresh(this.getCommits());
				}
			}

			refreshState.inProgress = false;
			this.renderRefreshButton();
		}

		this.finaliseRepoLoad(true);
	}

	private finaliseRepoLoad(didLoadRepoData: boolean) {
		if (this.loadViewTo !== null && this.currentRepo === this.loadViewTo.repo) {
			if (this.loadViewTo.commitDetails && (this.expandedCommit === null || this.expandedCommit.commitHash !== this.loadViewTo.commitDetails.commitHash || this.expandedCommit.compareWithHash !== this.loadViewTo.commitDetails.compareWithHash)) {
				const commitIndex = this.getCommitId(this.loadViewTo.commitDetails.commitHash);
				const compareWithIndex = this.loadViewTo.commitDetails.compareWithHash !== null ? this.getCommitId(this.loadViewTo.commitDetails.compareWithHash) : null;
				const commitElems = getCommitElems();
				const commitElem = findCommitElemWithId(commitElems, commitIndex);
				const compareWithElem = findCommitElemWithId(commitElems, compareWithIndex);

				if (commitElem !== null && (this.loadViewTo.commitDetails.compareWithHash === null || compareWithElem !== null)) {
					if (compareWithElem !== null) {
						this.loadCommitComparison(commitElem, compareWithElem);
					} else {
						this.loadCommitDetails(commitElem);
					}
				} else {
					showErrorMessage('无法恢复代码评审，此仓库中加载提交时，在最近一次 ' + this.maxCommits + ' 提交中找不到');
				}
			} else if (this.loadViewTo.runCommandOnLoad) {
				switch (this.loadViewTo.runCommandOnLoad) {
					case 'fetch':
						this.fetchFromRemotesAction();
						break;
				}
			}
		}
		this.loadViewTo = null;

		if (this.gitConfig === null || (didLoadRepoData && this.currentRepoRefreshState.configChanges)) {
			this.requestLoadConfig();
		}
	}

	private clearCommits() {
		closeDialogAndContextMenu();
		this.moreCommitsAvailable = false;
		this.commits = [];
		this.commitHead = null;
		this.commitLookup = {};
		this.renderedGitBranchHead = null;
		this.closeCommitDetails(false);
		this.saveState();
		this.graph.loadCommits(this.commits, this.commitHead, this.commitLookup, this.onlyFollowFirstParent);
		this.tableElem.innerHTML = '';
		this.footerElem.innerHTML = '';
		this.renderGraph();
		this.findWidget.refresh();
	}

	public processLoadRepoInfoResponse(msg: GG.ResponseLoadRepoInfo) {
		if (msg.error === null) {
			const refreshState = this.currentRepoRefreshState;
			if (refreshState.inProgress && refreshState.loadRepoInfoRefreshId === msg.refreshId) {
				this.loadRepoInfo(msg.branches, msg.head, msg.remotes, msg.stashes, msg.isRepo);
			}
		} else {
			this.displayLoadDataError('无法加载存储库信息', msg.error);
		}
	}

	public processLoadCommitsResponse(msg: GG.ResponseLoadCommits) {
		if (msg.error === null) {
			const refreshState = this.currentRepoRefreshState;
			if (refreshState.inProgress && refreshState.loadCommitsRefreshId === msg.refreshId) {
				this.loadCommits(msg.commits, msg.head, msg.tags, msg.moreCommitsAvailable, msg.onlyFollowFirstParent);
			}
		} else {
			const error = this.gitBranches.length === 0 && msg.error.indexOf('bad revision \'HEAD\'') > -1
				? 'There are no commits in this repository.'
				: msg.error;
			this.displayLoadDataError('无法加载提交', error);
		}
	}

	public processLoadConfig(msg: GG.ResponseLoadConfig) {
		this.currentRepoRefreshState.requestingConfig = false;
		if (msg.config !== null && this.currentRepo === msg.repo) {
			this.gitConfig = msg.config;
			this.saveState();

			this.renderCdvExternalDiffBtn();
		}
		this.settingsWidget.refresh();
	}

	private displayLoadDataError(message: string, reason: string) {
		this.clearCommits();
		this.currentRepoRefreshState.inProgress = false;
		this.loadViewTo = null;
		this.renderRefreshButton();
		dialog.showError(message, reason, 'Retry', () => {
			this.refresh(true);
		});
	}

	public loadAvatar(email: string, image: string) {
		this.avatars[email] = image;
		this.saveState();
		let avatarsElems = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('avatar'), escapedEmail = escapeHtml(email);
		for (let i = 0; i < avatarsElems.length; i++) {
			if (avatarsElems[i].dataset.email === escapedEmail) {
				avatarsElems[i].innerHTML = '<img class="avatarImg" src="' + image + '">';
			}
		}
	}


	/* Getters */

	public getBranches(): ReadonlyArray<string> {
		return this.gitBranches;
	}

	public getBranchOptions(includeShowAll?: boolean): ReadonlyArray<DialogSelectInputOption> {
		const options: DialogSelectInputOption[] = [];
		if (includeShowAll) {
			options.push({ name: 'Show All', value: SHOW_ALL_BRANCHES });
		}
		for (let i = 0; i < this.config.customBranchGlobPatterns.length; i++) {
			options.push({ name: 'Glob: ' + this.config.customBranchGlobPatterns[i].name, value: this.config.customBranchGlobPatterns[i].glob });
		}
		for (let i = 0; i < this.gitBranches.length; i++) {
			options.push({ name: this.gitBranches[i].indexOf('remotes/') === 0 ? this.gitBranches[i].substring(8) : this.gitBranches[i], value: this.gitBranches[i] });
		}
		return options;
	}

	public getCommitId(hash: string) {
		return typeof this.commitLookup[hash] === 'number' ? this.commitLookup[hash] : null;
	}

	private getCommitOfElem(elem: HTMLElement) {
		let id = parseInt(elem.dataset.id!);
		return id < this.commits.length ? this.commits[id] : null;
	}

	public getCommits(): ReadonlyArray<GG.GitCommit> {
		return this.commits;
	}

	private getPushRemote(branch: string | null = null) {
		const possibleRemotes = [];
		if (this.gitConfig !== null) {
			if (branch !== null && typeof this.gitConfig.branches[branch] !== 'undefined') {
				possibleRemotes.push(this.gitConfig.branches[branch].pushRemote, this.gitConfig.branches[branch].remote);
			}
			possibleRemotes.push(this.gitConfig.pushDefault);
		}
		possibleRemotes.push('origin');
		return possibleRemotes.find((remote) => remote !== null && this.gitRemotes.includes(remote)) || this.gitRemotes[0];
	}

	public getRepoConfig(): Readonly<GG.GitRepoConfig> | null {
		return this.gitConfig;
	}

	public getRepoState(repo: string): Readonly<GG.GitRepoState> | null {
		return typeof this.gitRepos[repo] !== 'undefined'
			? this.gitRepos[repo]
			: null;
	}

	public isConfigLoading(): boolean {
		return this.currentRepoRefreshState.requestingConfig;
	}


	/* Refresh */

	public refresh(hard: boolean, configChanges: boolean = false) {
		if (hard) {
			this.clearCommits();
		}
		this.requestLoadRepoInfoAndCommits(hard, false, configChanges);
	}


	/* Requests */

	private requestLoadRepoInfo() {
		const repoState = this.gitRepos[this.currentRepo];
		sendMessage({
			command: 'loadRepoInfo',
			repo: this.currentRepo,
			refreshId: ++this.currentRepoRefreshState.loadRepoInfoRefreshId,
			showRemoteBranches: getShowRemoteBranches(repoState.showRemoteBranchesV2),
			showStashes: getShowStashes(repoState.showStashes),
			hideRemotes: repoState.hideRemotes
		});
	}

	private requestLoadCommits() {
		const repoState = this.gitRepos[this.currentRepo];
		sendMessage({
			command: 'loadCommits',
			repo: this.currentRepo,
			refreshId: ++this.currentRepoRefreshState.loadCommitsRefreshId,
			branches: this.currentBranches === null || (this.currentBranches.length === 1 && this.currentBranches[0] === SHOW_ALL_BRANCHES) ? null : this.currentBranches,
			maxCommits: this.maxCommits,
			showTags: getShowTags(repoState.showTags),
			showRemoteBranches: getShowRemoteBranches(repoState.showRemoteBranchesV2),
			includeCommitsMentionedByReflogs: getIncludeCommitsMentionedByReflogs(repoState.includeCommitsMentionedByReflogs),
			onlyFollowFirstParent: getOnlyFollowFirstParent(repoState.onlyFollowFirstParent),
			commitOrdering: getCommitOrdering(repoState.commitOrdering),
			remotes: this.gitRemotes,
			hideRemotes: repoState.hideRemotes,
			stashes: this.gitStashes
		});
	}

	private requestLoadRepoInfoAndCommits(hard: boolean, skipRepoInfo: boolean, configChanges: boolean = false) {
		const refreshState = this.currentRepoRefreshState;
		if (refreshState.inProgress) {
			refreshState.hard = refreshState.hard || hard;
			refreshState.configChanges = refreshState.configChanges || configChanges;
			if (!skipRepoInfo) {
				// This request will trigger a loadCommit request after the loadRepoInfo request has completed.
				// Invalidate any previous commit requests in progress.
				refreshState.loadCommitsRefreshId++;
			}
		} else {
			refreshState.hard = hard;
			refreshState.inProgress = true;
			refreshState.repoInfoChanges = false;
			refreshState.configChanges = configChanges;
			refreshState.requestingRepoInfo = false;
		}

		this.renderRefreshButton();
		if (this.commits.length === 0) {
			this.tableElem.innerHTML = '<h2 id="loadingHeader">' + SVG_ICONS.loading + '加载中...</h2>';
		}

		if (skipRepoInfo) {
			if (!refreshState.requestingRepoInfo) {
				this.requestLoadCommits();
			}
		} else {
			refreshState.requestingRepoInfo = true;
			this.requestLoadRepoInfo();
		}
	}

	public requestLoadConfig() {
		this.currentRepoRefreshState.requestingConfig = true;
		sendMessage({ command: 'loadConfig', repo: this.currentRepo, remotes: this.gitRemotes });
		this.settingsWidget.refresh();
	}

	public requestCommitDetails(hash: string, refresh: boolean) {
		let commit = this.commits[this.commitLookup[hash]];
		sendMessage({
			command: 'commitDetails',
			repo: this.currentRepo,
			commitHash: hash,
			hasParents: commit.parents.length > 0,
			stash: commit.stash,
			avatarEmail: this.config.fetchAvatars && hash !== UNCOMMITTED ? commit.email : null,
			refresh: refresh
		});
	}

	public requestCommitComparison(hash: string, compareWithHash: string, refresh: boolean) {
		let commitOrder = this.getCommitOrder(hash, compareWithHash);
		sendMessage({
			command: 'compareCommits',
			repo: this.currentRepo,
			commitHash: hash, compareWithHash: compareWithHash,
			fromHash: commitOrder.from, toHash: commitOrder.to,
			refresh: refresh
		});
	}

	private requestAvatars(avatars: { [email: string]: string[] }) {
		let emails = Object.keys(avatars), remote = this.gitRemotes.length > 0 ? this.gitRemotes.includes('origin') ? 'origin' : this.gitRemotes[0] : null;
		for (let i = 0; i < emails.length; i++) {
			sendMessage({ command: 'fetchAvatar', repo: this.currentRepo, remote: remote, email: emails[i], commits: avatars[emails[i]] });
		}
	}


	/* State */

	public saveState() {
		let expandedCommit;
		if (this.expandedCommit !== null) {
			expandedCommit = Object.assign({}, this.expandedCommit);
			expandedCommit.commitElem = null;
			expandedCommit.compareWithElem = null;
			expandedCommit.contextMenuOpen = {
				summary: false,
				fileView: -1
			};
		} else {
			expandedCommit = null;
		}

		VSCODE_API.setState({
			currentRepo: this.currentRepo,
			currentRepoLoading: this.currentRepoLoading,
			gitRepos: this.gitRepos,
			gitBranches: this.gitBranches,
			gitBranchHead: this.gitBranchHead,
			gitConfig: this.gitConfig,
			gitRemotes: this.gitRemotes,
			gitStashes: this.gitStashes,
			gitTags: this.gitTags,
			commits: this.commits,
			commitHead: this.commitHead,
			avatars: this.avatars,
			currentBranches: this.currentBranches,
			moreCommitsAvailable: this.moreCommitsAvailable,
			maxCommits: this.maxCommits,
			onlyFollowFirstParent: this.onlyFollowFirstParent,
			expandedCommit: expandedCommit,
			scrollTop: this.scrollTop,
			findWidget: this.findWidget.getState(),
			settingsWidget: this.settingsWidget.getState()
		});
	}

	public saveRepoState() {
		sendMessage({ command: 'setRepoState', repo: this.currentRepo, state: this.gitRepos[this.currentRepo] });
	}

	private saveColumnWidths(columnWidths: GG.ColumnWidth[]) {
		this.gitRepos[this.currentRepo].columnWidths = [columnWidths[0], columnWidths[2], columnWidths[3], columnWidths[4]];
		this.saveRepoState();
	}

	private saveExpandedCommitLoading(index: number, commitHash: string, commitElem: HTMLElement, compareWithHash: string | null, compareWithElem: HTMLElement | null) {
		this.expandedCommit = {
			index: index,
			commitHash: commitHash,
			commitElem: commitElem,
			compareWithHash: compareWithHash,
			compareWithElem: compareWithElem,
			commitDetails: null,
			fileChanges: null,
			fileTree: null,
			avatar: null,
			codeReview: null,
			lastViewedFile: null,
			loading: true,
			scrollTop: {
				summary: 0,
				fileView: 0
			},
			contextMenuOpen: {
				summary: false,
				fileView: -1
			}
		};
		this.saveState();
	}

	public saveRepoStateValue<K extends keyof GG.GitRepoState>(repo: string, key: K, value: GG.GitRepoState[K]) {
		if (repo === this.currentRepo) {
			this.gitRepos[this.currentRepo][key] = value;
			this.saveRepoState();
		}
	}


	/* Renderers */

	private render() {
		this.renderTable();
		this.renderGraph();
	}

	private renderGraph() {
		if (typeof this.currentRepo === 'undefined') {
			// Only render the graph if a repo is loaded (or a repo is currently being loaded)
			return;
		}

		const colHeadersElem = document.getElementById('tableColHeaders');
		const cdvHeight = this.gitRepos[this.currentRepo].cdvHeight;
		const headerHeight = colHeadersElem !== null ? colHeadersElem.clientHeight + 1 : 0;
		const expandedCommit = this.isCdvDocked() ? null : this.expandedCommit;
		const expandedCommitElem = expandedCommit !== null ? document.getElementById('cdv') : null;

		// Update the graphs grid dimensions
		this.config.graph.grid.expandY = expandedCommitElem !== null
			? expandedCommitElem.getBoundingClientRect().height
			: cdvHeight;
		this.config.graph.grid.y = this.commits.length > 0 && this.tableElem.children.length > 0
			? (this.tableElem.children[0].clientHeight - headerHeight - (expandedCommit !== null ? cdvHeight : 0)) / this.commits.length
			: this.config.graph.grid.y;
		this.config.graph.grid.offsetY = headerHeight + this.config.graph.grid.y / 2;

		this.graph.render(expandedCommit);
	}

	private renderTable() {
		const colVisibility = this.getColumnVisibility();
		const currentHash = this.commits.length > 0 && this.commits[0].hash === UNCOMMITTED ? UNCOMMITTED : this.commitHead;
		const vertexColours = this.graph.getVertexColours();
		const widthsAtVertices = this.config.referenceLabels.branchLabelsAlignedToGraph ? this.graph.getWidthsAtVertices() : [];
		const mutedCommits = this.graph.getMutedCommits(currentHash);
		const textFormatter = new TextFormatter(this.commits, this.gitRepos[this.currentRepo].issueLinkingConfig, {
			emoji: true,
			issueLinking: true,
			markdown: this.config.markdown
		});

		let html = '<tr id="tableColHeaders"><th id="tableHeaderGraphCol" class="tableColHeader" data-col="0">Graph</th><th class="tableColHeader" data-col="1">描述</th>' +
			(colVisibility.date ? '<th class="tableColHeader dateCol" data-col="2">时间</th>' : '') +
			(colVisibility.author ? '<th class="tableColHeader authorCol" data-col="3">作者</th>' : '') +
			(colVisibility.commit ? '<th class="tableColHeader" data-col="4">提交</th>' : '') +
			'</tr>';

		for (let i = 0; i < this.commits.length; i++) {
			let commit = this.commits[i];
			let message = '<span class="text">' + textFormatter.format(commit.message) + '</span>';
			let date = formatShortDate(commit.date);
			let branchLabels = getBranchLabels(commit.heads, commit.remotes);
			let refBranches = '', refTags = '', j, k, refName, remoteName, refActive, refHtml, branchCheckedOutAtCommit: string | null = null;

			for (j = 0; j < branchLabels.heads.length; j++) {
				refName = escapeHtml(branchLabels.heads[j].name);
				refActive = branchLabels.heads[j].name === this.gitBranchHead;
				refHtml = '<span class="gitRef head' + (refActive ? ' active' : '') + '" data-name="' + refName + '">' + SVG_ICONS.branch + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span>';
				for (k = 0; k < branchLabels.heads[j].remotes.length; k++) {
					remoteName = escapeHtml(branchLabels.heads[j].remotes[k]);
					refHtml += '<span class="gitRefHeadRemote" data-remote="' + remoteName + '" data-fullref="' + escapeHtml(branchLabels.heads[j].remotes[k] + '/' + branchLabels.heads[j].name) + '">' + remoteName + '</span>';
				}
				refHtml += '</span>';
				refBranches = refActive ? refHtml + refBranches : refBranches + refHtml;
				if (refActive) branchCheckedOutAtCommit = this.gitBranchHead;
			}
			for (j = 0; j < branchLabels.remotes.length; j++) {
				refName = escapeHtml(branchLabels.remotes[j].name);
				refBranches += '<span class="gitRef remote" data-name="' + refName + '" data-remote="' + (branchLabels.remotes[j].remote !== null ? escapeHtml(branchLabels.remotes[j].remote!) : '') + '">' + SVG_ICONS.branch + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span></span>';
			}

			for (j = 0; j < commit.tags.length; j++) {
				refName = escapeHtml(commit.tags[j].name);
				refTags += '<span class="gitRef tag" data-name="' + refName + '" data-tagtype="' + (commit.tags[j].annotated ? '带注释' : '轻量级的') + '">' + SVG_ICONS.tag + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span></span>';
			}

			if (commit.stash !== null) {
				refName = escapeHtml(commit.stash.selector);
				refBranches = '<span class="gitRef stash" data-name="' + refName + '">' + SVG_ICONS.stash + '<span class="gitRefName" data-fullref="' + refName + '">' + escapeHtml(commit.stash.selector.substring(5)) + '</span></span>' + refBranches;
			}

			const commitDot = commit.hash === this.commitHead
				? '<span class="commitHeadDot" title="' + (branchCheckedOutAtCommit !== null
					? '当前是否在此提交时切换 ' + escapeHtml('"' + branchCheckedOutAtCommit + '"') + ' 这个分支'
					: '当前已切换这个提交'
				) + '."></span>'
				: '';

			html += '<tr class="commit' + (commit.hash === currentHash ? ' current' : '') + (mutedCommits[i] ? ' mute' : '') + '"' + (commit.hash !== UNCOMMITTED ? '' : ' id="uncommittedChanges"') + ' data-id="' + i + '" data-color="' + vertexColours[i] + '">' +
				(this.config.referenceLabels.branchLabelsAlignedToGraph ? '<td>' + (refBranches !== '' ? '<span style="margin-left:' + (widthsAtVertices[i] - 4) + 'px"' + refBranches.substring(5) : '') + '</td><td><span class="description">' + commitDot : '<td></td><td><span class="description">' + commitDot + refBranches) + (this.config.referenceLabels.tagLabelsOnRight ? message + refTags : refTags + message) + '</span></td>' +
				(colVisibility.date ? '<td class="dateCol text" title="' + date.title + '">' + date.formatted + '</td>' : '') +
				(colVisibility.author ? '<td class="authorCol text" title="' + escapeHtml(commit.author + ' <' + commit.email + '>') + '">' + (this.config.fetchAvatars ? '<span class="avatar" data-email="' + escapeHtml(commit.email) + '">' + (typeof this.avatars[commit.email] === 'string' ? '<img class="avatarImg" src="' + this.avatars[commit.email] + '">' : '') + '</span>' : '') + escapeHtml(commit.author) + '</td>' : '') +
				(colVisibility.commit ? '<td class="text" title="' + escapeHtml(commit.hash) + '">' + abbrevCommit(commit.hash) + '</td>' : '') +
				'</tr>';
		}
		this.tableElem.innerHTML = '<table>' + html + '</table>';
		this.footerElem.innerHTML = this.moreCommitsAvailable ? '<div id="loadMoreCommitsBtn" class="roundedBtn">加载更多提交</div>' : '';
		this.makeTableResizable();
		this.findWidget.refresh();
		this.renderedGitBranchHead = this.gitBranchHead;

		if (this.moreCommitsAvailable) {
			document.getElementById('loadMoreCommitsBtn')!.addEventListener('click', () => {
				this.loadMoreCommits();
			});
		}

		if (this.expandedCommit !== null) {
			const expandedCommit = this.expandedCommit, elems = getCommitElems();
			const commitElem = findCommitElemWithId(elems, this.getCommitId(expandedCommit.commitHash));
			const compareWithElem = expandedCommit.compareWithHash !== null ? findCommitElemWithId(elems, this.getCommitId(expandedCommit.compareWithHash)) : null;

			if (commitElem === null || (expandedCommit.compareWithHash !== null && compareWithElem === null)) {
				this.closeCommitDetails(false);
				this.saveState();
			} else {
				expandedCommit.index = parseInt(commitElem.dataset.id!);
				expandedCommit.commitElem = commitElem;
				expandedCommit.compareWithElem = compareWithElem;
				this.saveState();
				if (expandedCommit.compareWithHash === null) {
					// Commit Details View is open
					if (!expandedCommit.loading && expandedCommit.commitDetails !== null && expandedCommit.fileTree !== null) {
						this.showCommitDetails(expandedCommit.commitDetails, expandedCommit.fileTree, expandedCommit.avatar, expandedCommit.codeReview, expandedCommit.lastViewedFile, true);
						if (expandedCommit.commitHash === UNCOMMITTED) {
							this.requestCommitDetails(expandedCommit.commitHash, true);
						}
					} else {
						this.loadCommitDetails(commitElem);
					}
				} else {
					// Commit Comparison is open
					if (!expandedCommit.loading && expandedCommit.fileChanges !== null && expandedCommit.fileTree !== null) {
						this.showCommitComparison(expandedCommit.commitHash, expandedCommit.compareWithHash, expandedCommit.fileChanges, expandedCommit.fileTree, expandedCommit.codeReview, expandedCommit.lastViewedFile, true);
						if (expandedCommit.commitHash === UNCOMMITTED || expandedCommit.compareWithHash === UNCOMMITTED) {
							this.requestCommitComparison(expandedCommit.commitHash, expandedCommit.compareWithHash, true);
						}
					} else {
						this.loadCommitComparison(commitElem, compareWithElem!);
					}
				}
			}
		}
	}

	private renderUncommittedChanges() {
		const colVisibility = this.getColumnVisibility(), date = formatShortDate(this.commits[0].date);
		document.getElementById('uncommittedChanges')!.innerHTML = '<td></td><td><b>' + escapeHtml(this.commits[0].message) + '</b></td>' +
			(colVisibility.date ? '<td class="dateCol text" title="' + date.title + '">' + date.formatted + '</td>' : '') +
			(colVisibility.author ? '<td class="authorCol text" title="* <>">*</td>' : '') +
			(colVisibility.commit ? '<td class="text" title="*">*</td>' : '');
	}

	private renderFetchButton() {
		alterClass(this.controlsElem, CLASS_FETCH_SUPPORTED, this.gitRemotes.length > 0);
	}

	public renderRefreshButton() {
		const enabled = !this.currentRepoRefreshState.inProgress;
		this.refreshBtnElem.title = enabled ? '刷新' : '刷新中';
		this.refreshBtnElem.innerHTML = enabled ? SVG_ICONS.refresh : SVG_ICONS.loading;
		alterClass(this.refreshBtnElem, CLASS_REFRESHING, !enabled);
	}

	public renderTagDetails(tagName: string, commitHash: string, details: GG.GitTagDetails) {
		const textFormatter = new TextFormatter(this.commits, this.gitRepos[this.currentRepo].issueLinkingConfig, {
			commits: true,
			emoji: true,
			issueLinking: true,
			markdown: this.config.markdown,
			multiline: true,
			urls: true
		});
		dialog.showMessage(
			'标签 <b><i>' + escapeHtml(tagName) + '</i></b><br><span class="messageContent">' +
			'<b>对象: </b>' + escapeHtml(details.hash) + '<br>' +
			'<b>提交: </b>' + escapeHtml(commitHash) + '<br>' +
			'<b>打标签者: </b>' + escapeHtml(details.taggerName) + ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(details.taggerEmail) + '" tabindex="-1">' + escapeHtml(details.taggerEmail) + '</a>&gt;' + (details.signature !== null ? generateSignatureHtml(details.signature) : '') + '<br>' +
			'<b>时间: </b>' + formatLongDate(details.taggerDate) + '<br><br>' +
			textFormatter.format(details.message) +
			'</span>'
		);
	}

	public renderRepoDropdownOptions(repo?: string) {
		this.repoDropdown.setOptions(getRepoDropdownOptions(this.gitRepos), [repo || this.currentRepo]);
	}


	/* Context Menu Generation */

	private getBranchContextMenuActions(target: DialogTarget & RefTarget): ContextMenuActions {
		const refName = target.ref, visibility = this.config.contextMenuActionsVisibility.branch;
		const isSelectedInBranchesDropdown = this.branchDropdown.isSelected(refName);
		return [[
			{
				title: '切换分支',
				visible: visibility.checkout && this.gitBranchHead !== refName,
				onClick: () => this.checkoutBranchAction(refName, null, null, target)
			}, {
				title: '重命名分支' + ELLIPSIS,
				visible: visibility.rename,
				onClick: () => {
					dialog.showRefInput('输入分支 <b><i>' + escapeHtml(refName) + '</i></b> 的新名称:', refName, '重命名分支', (newName) => {
						runAction({ command: 'renameBranch', repo: this.currentRepo, oldName: refName, newName: newName }, '分支重命名中');
					}, target);
				}
			}, {
				title: '删除分支' + ELLIPSIS,
				visible: visibility.delete && this.gitBranchHead !== refName,
				onClick: () => {
					let remotesWithBranch = this.gitRemotes.filter(remote => this.gitBranches.includes('remotes/' + remote + '/' + refName));
					let inputs: DialogInput[] = [{ type: DialogInputType.Checkbox, name: 'Force Delete', value: this.config.dialogDefaults.deleteBranch.forceDelete }];
					if (remotesWithBranch.length > 0) {
						inputs.push({
							type: DialogInputType.Checkbox,
							name: '删除远程仓库上的这个分支' + (this.gitRemotes.length > 1 ? 's' : ''),
							value: false,
							info: '这个分支在远程' + (remotesWithBranch.length > 1 ? 's: ' : ' ') + formatCommaSeparatedList(remotesWithBranch.map((remote) => '"' + remote + '"'))
						});
					}
					dialog.showForm('你确定要删除分支 <b><i>' + escapeHtml(refName) + '</i></b>?', inputs, '是，删除', (values) => {
						runAction({ command: 'deleteBranch', repo: this.currentRepo, branchName: refName, forceDelete: <boolean>values[0], deleteOnRemotes: remotesWithBranch.length > 0 && <boolean>values[1] ? remotesWithBranch : [] }, '分支删除中');
					}, target);
				}
			}, {
				title: '合并到当前分支' + ELLIPSIS,
				visible: visibility.merge && this.gitBranchHead !== refName,
				onClick: () => this.mergeAction(refName, refName, GG.MergeActionOn.Branch, target)
			}, {
				title: '在分支上复位当前分支' + ELLIPSIS,
				visible: visibility.rebase && this.gitBranchHead !== refName,
				onClick: () => this.rebaseAction(refName, refName, GG.RebaseActionOn.Branch, target)
			}, {
				title: '推送分支' + ELLIPSIS,
				visible: visibility.push && this.gitRemotes.length > 0,
				onClick: () => {
					const multipleRemotes = this.gitRemotes.length > 1;
					const inputs: DialogInput[] = [
						{ type: DialogInputType.Checkbox, name: '设置上游', value: true },
						{
							type: DialogInputType.Radio,
							name: '推送模式',
							options: [
								{ name: '正常', value: GG.GitPushBranchMode.Normal },
								{ name: '更安全的强制推送', value: GG.GitPushBranchMode.ForceWithLease },
								{ name: '强制', value: GG.GitPushBranchMode.Force }
							],
							default: GG.GitPushBranchMode.Normal
						}
					];

					if (multipleRemotes) {
						inputs.unshift({
							type: DialogInputType.Select,
							name: '推送到远程仓库分支',
							defaults: [this.getPushRemote(refName)],
							options: this.gitRemotes.map((remote) => ({ name: remote, value: remote })),
							multiple: true
						});
					}

					dialog.showForm('你确定要推送分支 <b><i>' + escapeHtml(refName) + '</i></b>' + (multipleRemotes ? '' : ' 到远程仓库分支 <b><i>' + escapeHtml(this.gitRemotes[0]) + '</i></b>') + '吗?', inputs, '是，推送', (values) => {
						const remotes = multipleRemotes ? <string[]>values.shift() : [this.gitRemotes[0]];
						const setUpstream = <boolean>values[0];
						runAction({
							command: 'pushBranch',
							repo: this.currentRepo,
							branchName: refName,
							remotes: remotes,
							setUpstream: setUpstream,
							mode: <GG.GitPushBranchMode>values[1],
							willUpdateBranchConfig: setUpstream && remotes.length > 0 && (this.gitConfig === null || typeof this.gitConfig.branches[refName] === 'undefined' || this.gitConfig.branches[refName].remote !== remotes[remotes.length - 1])
						}, '分支推送中');
					}, target);
				}
			}
		], [
			this.getViewIssueAction(refName, visibility.viewIssue, target),
			{
				title: '创建拉取请求' + ELLIPSIS,
				visible: visibility.createPullRequest && this.gitRepos[this.currentRepo].pullRequestConfig !== null,
				onClick: () => {
					const config = this.gitRepos[this.currentRepo].pullRequestConfig;
					if (config === null) return;
					dialog.showCheckbox('你确定要为分支创建一个拉取请求 <b><i>' + escapeHtml(refName) + '</i></b>吗?', '推送分支会在创建拉取请求之前', true, '是，创建拉取请求', (push) => {
						runAction({ command: 'createPullRequest', repo: this.currentRepo, config: config, sourceRemote: config.sourceRemote, sourceOwner: config.sourceOwner, sourceRepo: config.sourceRepo, sourceBranch: refName, push: push }, '拉取请求创建中');
					}, target);
				}
			}
		], [
			{
				title: '创建存档',
				visible: visibility.createArchive,
				onClick: () => {
					runAction({ command: 'createArchive', repo: this.currentRepo, ref: refName }, '存档创建中');
				}
			},
			{
				title: '选择分支下拉菜单',
				visible: visibility.selectInBranchesDropdown && !isSelectedInBranchesDropdown,
				onClick: () => this.branchDropdown.selectOption(refName)
			},
			{
				title: '取消选择分支下拉菜单',
				visible: visibility.unselectInBranchesDropdown && isSelectedInBranchesDropdown,
				onClick: () => this.branchDropdown.unselectOption(refName)
			}
		], [
			{
				title: '复制分支名称到剪切板',
				visible: visibility.copyName,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Branch Name', data: refName });
				}
			}
		]];
	}

	private getCommitContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions {
		const hash = target.hash, visibility = this.config.contextMenuActionsVisibility.commit;
		const commit = this.commits[this.commitLookup[hash]];
		return [[
			{
				title: '添加标签' + ELLIPSIS,
				visible: visibility.addTag,
				onClick: () => this.addTagAction(hash, '', this.config.dialogDefaults.addTag.type, '', null, target)
			}, {
				title: '创建新分支' + ELLIPSIS,
				visible: visibility.createBranch,
				onClick: () => this.createBranchAction(hash, '', this.config.dialogDefaults.createBranch.checkout, target)
			}
		], [
			{
				title: '切换到' + (globalState.alwaysAcceptCheckoutCommit ? '' : ELLIPSIS),
				visible: visibility.checkout,
				onClick: () => {
					const checkoutCommit = () => runAction({ command: 'checkoutCommit', repo: this.currentRepo, commitHash: hash }, '正在切换到提交');
					if (globalState.alwaysAcceptCheckoutCommit) {
						checkoutCommit();
					} else {
						dialog.showCheckbox('你确定要切换到提交 <b><i>' + abbrevCommit(hash) + '</i></b> 吗? 这会导致处于 \'detached HEAD(游离)\' 状态.', '总是接受', false, '是，切换', (alwaysAccept) => {
							if (alwaysAccept) {
								updateGlobalViewState('alwaysAcceptCheckoutCommit', true);
							}
							checkoutCommit();
						}, target);
					}
				}
			}, {
				title: 'Cherry Pick(选择提交)' + ELLIPSIS,
				visible: visibility.cherrypick,
				onClick: () => {
					const isMerge = commit.parents.length > 1;
					let inputs: DialogInput[] = [];
					if (isMerge) {
						let options = commit.parents.map((hash, index) => ({
							name: abbrevCommit(hash) + (typeof this.commitLookup[hash] === 'number' ? ': ' + this.commits[this.commitLookup[hash]].message : ''),
							value: (index + 1).toString()
						}));
						inputs.push({
							type: DialogInputType.Select,
							name: 'Parent Hash',
							options: options,
							default: '1',
							info: '选择主分支上的父哈希值，以cherry pick相对于它的提交'
						});
					}
					inputs.push({
						type: DialogInputType.Checkbox,
						name: '记录来源',
						value: this.config.dialogDefaults.cherryPick.recordOrigin,
						info: '通过在原始提交消息后面附加一行来记录此提交来自于cherry pick"(从某个提交中cherry pick...​)".'
					}, {
						type: DialogInputType.Checkbox,
						name: '不提交',
						value: this.config.dialogDefaults.cherryPick.noCommit,
						info: 'Cherry pick的更改将被暂存，但不会提交，因此你可以选择提交此提交的特定部分'
					});

					dialog.showForm('你确定要cherry pick到 <b><i>' + abbrevCommit(hash) + '</i></b> 提交吗?', inputs, '是, cherry pick', (values) => {
						let parentIndex = isMerge ? parseInt(<string>values.shift()) : 0;
						runAction({
							command: 'cherrypickCommit',
							repo: this.currentRepo,
							commitHash: hash,
							parentIndex: parentIndex,
							recordOrigin: <boolean>values[0],
							noCommit: <boolean>values[1]
						}, '正在Cherry pick到提交');
					}, target);
				}
			}, {
				title: 'Revert(回撤)' + ELLIPSIS,
				visible: visibility.revert,
				onClick: () => {
					if (commit.parents.length > 1) {
						let options = commit.parents.map((hash, index) => ({
							name: abbrevCommit(hash) + (typeof this.commitLookup[hash] === 'number' ? ': ' + this.commits[this.commitLookup[hash]].message : ''),
							value: (index + 1).toString()
						}));
						dialog.showSelect('你确定要回撤合并到 <b><i>' + abbrevCommit(hash) + '</i></b> 提交吗? 选择主分支上的父hash值，以恢复相对于以下节点的提交:', '1', options, '是，回撤', (parentIndex) => {
							runAction({ command: 'revertCommit', repo: this.currentRepo, commitHash: hash, parentIndex: parseInt(parentIndex) }, '正在回撤到提交');
						}, target);
					} else {
						dialog.showConfirmation('你确定要回撤合并到 <b><i>' + abbrevCommit(hash) + '</i></b> 提交吗?', '是，回撤', () => {
							runAction({ command: 'revertCommit', repo: this.currentRepo, commitHash: hash, parentIndex: 0 }, '正在回撤到提交');
						}, target);
					}
				}
			}, {
				title: '删除' + ELLIPSIS,
				visible: visibility.drop && this.graph.dropCommitPossible(this.commitLookup[hash]),
				onClick: () => {
					dialog.showConfirmation('你确定要永久地删除 <b><i>' + abbrevCommit(hash) + '</i></b> 提交吗?' + (this.onlyFollowFirstParent ? '<br/><i>注意:通过启用“只跟随提交的第一个父节点”，一些提交可能被隐藏在Git Graph视图中，这可能会影响执行此操作的结果。</i>' : ''), '是，删除', () => {
						runAction({ command: 'dropCommit', repo: this.currentRepo, commitHash: hash }, '正在删除提交');
					}, target);
				}
			}
		], [
			{
				title: '合并到当前分支' + ELLIPSIS,
				visible: visibility.merge,
				onClick: () => this.mergeAction(hash, abbrevCommit(hash), GG.MergeActionOn.Commit, target)
			}, {
				title: '基于该提交重新建立当前分支(Rebase)' + ELLIPSIS,
				visible: visibility.rebase,
				onClick: () => this.rebaseAction(hash, abbrevCommit(hash), GG.RebaseActionOn.Commit, target)
			}, {
				title: '复位当前分支到此处' + ELLIPSIS,
				visible: visibility.reset,
				onClick: () => {
					dialog.showSelect('你确定要复位 ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (当前分支)' : '当前分支') + '到 <b><i>' + abbrevCommit(hash) + '</i></b> 提交吗 ?', this.config.dialogDefaults.resetCommit.mode, [
						{ name: '软模式 - 保持工作目录和索引均不变', value: GG.GitResetMode.Soft },
						{ name: '混合模式 - 不碰工作目录,只是复位索引', value: GG.GitResetMode.Mixed },
						{ name: '硬模式 - 放弃所有本地修改', value: GG.GitResetMode.Hard }
					], '是，复位', (mode) => {
						runAction({ command: 'resetToCommit', repo: this.currentRepo, commit: hash, resetMode: <GG.GitResetMode>mode }, '正在复位到提交');
					}, target);
				}
			}
		], [
			{
				title: '复制提交的哈希值到剪切板',
				visible: visibility.copyHash,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Commit Hash', data: hash });
				}
			},
			{
				title: '复制提交的消息到剪切板',
				visible: visibility.copySubject,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Commit Subject', data: commit.message });
				}
			}
		]];
	}

	private getRemoteBranchContextMenuActions(remote: string, target: DialogTarget & RefTarget): ContextMenuActions {
		const refName = target.ref, visibility = this.config.contextMenuActionsVisibility.remoteBranch;
		const branchName = remote !== '' ? refName.substring(remote.length + 1) : '';
		const prefixedRefName = 'remotes/' + refName;
		const isSelectedInBranchesDropdown = this.branchDropdown.isSelected(prefixedRefName);
		return [[
			{
				title: '切换分支' + ELLIPSIS,
				visible: visibility.checkout,
				onClick: () => this.checkoutBranchAction(refName, remote, null, target)
			}, {
				title: '删除远程仓库' + ELLIPSIS,
				visible: visibility.delete && remote !== '',
				onClick: () => {
					dialog.showConfirmation('你确定要删除远程仓库分支 <b><i>' + escapeHtml(refName) + '</i></b> 吗?', '是，删除', () => {
						runAction({ command: 'deleteRemoteBranch', repo: this.currentRepo, branchName: branchName, remote: remote }, '正在删除远程仓库');
					}, target);
				}
			}, {
				title: '获取到本地分支' + ELLIPSIS,
				visible: visibility.fetch && remote !== '' && this.gitBranches.includes(branchName) && this.gitBranchHead !== branchName,
				onClick: () => {
					dialog.showForm('你确定你想获取远程仓库分支 <b><i>' + escapeHtml(refName) + '</i></b> 到本地分支 <b><i>' + escapeHtml(branchName) + '</i></b> 吗?', [{
						type: DialogInputType.Checkbox,
						name: '强制获取',
						value: this.config.dialogDefaults.fetchIntoLocalBranch.forceFetch,
						info: '强制将本地分支复位到此远程仓库分支'
					}], '是，获取', (values) => {
						runAction({ command: 'fetchIntoLocalBranch', repo: this.currentRepo, remote: remote, remoteBranch: branchName, localBranch: branchName, force: <boolean>values[0] }, '正在获取分支');
					}, target);
				}
			}, {
				title: '合并到当前分支' + ELLIPSIS,
				visible: visibility.merge,
				onClick: () => this.mergeAction(refName, refName, GG.MergeActionOn.RemoteTrackingBranch, target)
			}, {
				title: '拉取到当前分支' + ELLIPSIS,
				visible: visibility.pull && remote !== '',
				onClick: () => {
					dialog.showForm('你确定要拉取远程仓库分支 <b><i>' + escapeHtml(refName) + '</i></b> 到 ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (当前分支)' : '当前分支') + '吗? 如果是则需要合并:', [
						{ type: DialogInputType.Checkbox, name: '创建一个新的提交，即使快进是可能的(Create a new commit even if fast-forward is possible)', value: this.config.dialogDefaults.pullBranch.noFastForward },
						{ type: DialogInputType.Checkbox, name: 'Squash Commits(控制提交)', value: this.config.dialogDefaults.pullBranch.squash, info: '在当前分支上创建单独提交，其效果与合并到这个远程仓库分支相同' }
					], '是，拉取', (values) => {
						runAction({ command: 'pullBranch', repo: this.currentRepo, branchName: branchName, remote: remote, createNewCommit: <boolean>values[0], squash: <boolean>values[1] }, '正在拉取分支');
					}, target);
				}
			}
		], [
			this.getViewIssueAction(refName, visibility.viewIssue, target),
			{
				title: '创建拉取请求',
				visible: visibility.createPullRequest && this.gitRepos[this.currentRepo].pullRequestConfig !== null && branchName !== 'HEAD' &&
					(this.gitRepos[this.currentRepo].pullRequestConfig!.sourceRemote === remote || this.gitRepos[this.currentRepo].pullRequestConfig!.destRemote === remote),
				onClick: () => {
					const config = this.gitRepos[this.currentRepo].pullRequestConfig;
					if (config === null) return;
					const isDestRemote = config.destRemote === remote;
					runAction({
						command: 'createPullRequest',
						repo: this.currentRepo,
						config: config,
						sourceRemote: isDestRemote ? config.destRemote! : config.sourceRemote,
						sourceOwner: isDestRemote ? config.destOwner : config.sourceOwner,
						sourceRepo: isDestRemote ? config.destRepo : config.sourceRepo,
						sourceBranch: branchName,
						push: false
					}, 'Creating Pull Request');
				}
			}
		], [
			{
				title: '创建存档',
				visible: visibility.createArchive,
				onClick: () => {
					runAction({ command: 'createArchive', repo: this.currentRepo, ref: refName }, '正在创建存档');
				}
			},
			{
				title: '选择分支下拉菜单',
				visible: visibility.selectInBranchesDropdown && !isSelectedInBranchesDropdown,
				onClick: () => this.branchDropdown.selectOption(prefixedRefName)
			},
			{
				title: '取消选择分支下拉菜单',
				visible: visibility.unselectInBranchesDropdown && isSelectedInBranchesDropdown,
				onClick: () => this.branchDropdown.unselectOption(prefixedRefName)
			}
		], [
			{
				title: '复制分支名到剪切板',
				visible: visibility.copyName,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Branch Name', data: refName });
				}
			}
		]];
	}

	private getStashContextMenuActions(target: DialogTarget & RefTarget): ContextMenuActions {
		const hash = target.hash, selector = target.ref, visibility = this.config.contextMenuActionsVisibility.stash;
		return [[
			{
				title: '恢复暂存状态' + ELLIPSIS,
				visible: visibility.apply,
				onClick: () => {
					dialog.showForm('你确定想要恢复暂存状态 <b><i>' + escapeHtml(selector.substring(5)) + '</i></b> 吗?', [{
						type: DialogInputType.Checkbox,
						name: '恢复索引',
						value: this.config.dialogDefaults.applyStash.reinstateIndex,
						info: '除了工作目录外，尝试恢复被更改的索引'
					}], '是，恢复暂存状态', (values) => {
						runAction({ command: 'applyStash', repo: this.currentRepo, selector: selector, reinstateIndex: <boolean>values[0] }, '正在恢复暂存状态');
					}, target);
				}
			}, {
				title: '从暂存区创建分支' + ELLIPSIS,
				visible: visibility.createBranch,
				onClick: () => {
					dialog.showRefInput('从暂存区已 <b><i>' + escapeHtml(selector.substring(5)) + '</i></b> 创建一个分支:', '', '创建分支', (branchName) => {
						runAction({ command: 'branchFromStash', repo: this.currentRepo, selector: selector, branchName: branchName }, '正在创建分支');
					}, target);
				}
			}, {
				title: 'Pop Stash(恢复并删除暂存状态)' + ELLIPSIS,
				visible: visibility.pop,
				onClick: () => {
					dialog.showForm('你确定想要恢复并删除暂存状态 <b><i>' + escapeHtml(selector.substring(5)) + '</i></b> 吗?', [{
						type: DialogInputType.Checkbox,
						name: '恢复索引',
						value: this.config.dialogDefaults.popStash.reinstateIndex,
						info: '除了工作目录外，尝试恢复被更改的索引'
					}], '是', (values) => {
						runAction({ command: 'popStash', repo: this.currentRepo, selector: selector, reinstateIndex: <boolean>values[0] }, 'Popping Stash');
					}, target);
				}
			}, {
				title: '删除暂存' + ELLIPSIS,
				visible: visibility.drop,
				onClick: () => {
					dialog.showConfirmation('你确定想要删除暂存状态 <b><i>' + escapeHtml(selector.substring(5)) + '</i></b> 吗?', '是，删除', () => {
						runAction({ command: 'dropStash', repo: this.currentRepo, selector: selector }, '正在删除暂存');
					}, target);
				}
			}
		], [
			{
				title: '复制暂存区名称到剪切板',
				visible: visibility.copyName,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Stash Name', data: selector });
				}
			}, {
				title: '复制暂存区哈希值到剪切板',
				visible: visibility.copyHash,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Stash Hash', data: hash });
				}
			}
		]];
	}

	private getTagContextMenuActions(isAnnotated: boolean, target: DialogTarget & RefTarget): ContextMenuActions {
		const hash = target.hash, tagName = target.ref, visibility = this.config.contextMenuActionsVisibility.tag;
		return [[
			{
				title: '查看详情',
				visible: visibility.viewDetails && isAnnotated,
				onClick: () => {
					runAction({ command: 'tagDetails', repo: this.currentRepo, tagName: tagName, commitHash: hash }, '正在检索标记详情');
				}
			}, {
				title: '删除标签' + ELLIPSIS,
				visible: visibility.delete,
				onClick: () => {
					let message = '你确定想要删除标签 <b><i>' + escapeHtml(tagName) + '</i></b> ?';
					if (this.gitRemotes.length > 1) {
						let options = [{ name: '不要在任何远程仓库分支上删除', value: '-1' }];
						this.gitRemotes.forEach((remote, i) => options.push({ name: remote, value: i.toString() }));
						dialog.showSelect(message + '<br>你还想删除远程仓库分支上的标签吗？:', '-1', options, '是，删除', remoteIndex => {
							this.deleteTagAction(tagName, remoteIndex !== '-1' ? this.gitRemotes[parseInt(remoteIndex)] : null);
						}, target);
					} else if (this.gitRemotes.length === 1) {
						dialog.showCheckbox(message, '在远程仓库分支上也删除', false, '是，删除', deleteOnRemote => {
							this.deleteTagAction(tagName, deleteOnRemote ? this.gitRemotes[0] : null);
						}, target);
					} else {
						dialog.showConfirmation(message, '是，删除', () => {
							this.deleteTagAction(tagName, null);
						}, target);
					}
				}
			}, {
				title: '推送标签' + ELLIPSIS,
				visible: visibility.push && this.gitRemotes.length > 0,
				onClick: () => {
					const runPushTagAction = (remotes: string[]) => {
						runAction({
							command: 'pushTag',
							repo: this.currentRepo,
							tagName: tagName,
							remotes: remotes,
							commitHash: hash,
							skipRemoteCheck: globalState.pushTagSkipRemoteCheck
						}, '正在推送标签');
					};

					if (this.gitRemotes.length === 1) {
						dialog.showConfirmation('你确定想要推送标签 <b><i>' + escapeHtml(tagName) + '</i></b> 到远程仓库分支 <b><i>' + escapeHtml(this.gitRemotes[0]) + '</i></b> 吗?', '是，推送', () => {
							runPushTagAction([this.gitRemotes[0]]);
						}, target);
					} else if (this.gitRemotes.length > 1) {
						const defaults = [this.getPushRemote()];
						const options = this.gitRemotes.map((remote) => ({ name: remote, value: remote }));
						dialog.showMultiSelect('你确定想要推送标签 <b><i>' + escapeHtml(tagName) + '</i></b> 吗? 选择要将标签推到的远程仓库分支:', defaults, options, '是，推送', (remotes) => {
							runPushTagAction(remotes);
						}, target);
					}
				}
			}
		], [
			{
				title: '创建存档',
				visible: visibility.createArchive,
				onClick: () => {
					runAction({ command: 'createArchive', repo: this.currentRepo, ref: tagName }, '正在创建存档');
				}
			},
			{
				title: '复制标签名称到剪切板',
				visible: visibility.copyName,
				onClick: () => {
					sendMessage({ command: 'copyToClipboard', type: 'Tag Name', data: tagName });
				}
			}
		]];
	}

	private getUncommittedChangesContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions {
		let visibility = this.config.contextMenuActionsVisibility.uncommittedChanges;
		return [[
			{
				title: '暂存未提交的更改' + ELLIPSIS,
				visible: visibility.stash,
				onClick: () => {
					dialog.showForm('你确定要暂存 <b>未提交的更改</b> 吗?', [
						{ type: DialogInputType.Text, name: '消息', default: '', placeholder: '选择' },
						{ type: DialogInputType.Checkbox, name: '包括未跟踪', value: this.config.dialogDefaults.stashUncommittedChanges.includeUntracked, info: '包括暂存的所有未跟踪文件，然后将它们从工作目录中清除' }
					], '是，', (values) => {
						runAction({ command: 'pushStash', repo: this.currentRepo, message: <string>values[0], includeUntracked: <boolean>values[1] }, '正在暂存未提交的更改');
					}, target);
				}
			}
		], [
			{
				title: '复位未提交的更改' + ELLIPSIS,
				visible: visibility.reset,
				onClick: () => {
					dialog.showSelect('你确定要复位 <b>未提交的更改</b> 到 <b>HEAD节点</b>?', this.config.dialogDefaults.resetUncommitted.mode, [
						{ name: '混合模式 - 不碰工作目录,只是复位索引', value: GG.GitResetMode.Mixed },
						{ name: '硬模式 - 放弃所有本地修改', value: GG.GitResetMode.Hard }
					], '是，复位', (mode) => {
						runAction({ command: 'resetToCommit', repo: this.currentRepo, commit: 'HEAD', resetMode: <GG.GitResetMode>mode }, '正在复位未提交的更改');
					}, target);
				}
			}, {
				title: '清理未跟踪的文件' + ELLIPSIS,
				visible: visibility.clean,
				onClick: () => {
					dialog.showCheckbox('你确定要清除所有未跟踪的文件吗?', '清理未跟踪的目录', true, '是，清理', directories => {
						runAction({ command: 'cleanUntrackedFiles', repo: this.currentRepo, directories: directories }, '正在清理未跟踪的文件');
					}, target);
				}
			}
		], [
			{
				title: '开源控件视图',
				visible: visibility.openSourceControlView,
				onClick: () => {
					sendMessage({ command: 'viewScm' });
				}
			}
		]];
	}

	private getViewIssueAction(refName: string, visible: boolean, target: DialogTarget & RefTarget): ContextMenuAction {
		const issueLinks: { url: string, displayText: string }[] = [];

		let issueLinking: IssueLinking | null, match: RegExpExecArray | null;
		if (visible && (issueLinking = parseIssueLinkingConfig(this.gitRepos[this.currentRepo].issueLinkingConfig)) !== null) {
			issueLinking.regexp.lastIndex = 0;
			while (match = issueLinking.regexp.exec(refName)) {
				if (match[0].length === 0) break;
				issueLinks.push({
					url: generateIssueLinkFromMatch(match, issueLinking),
					displayText: match[0]
				});
			}
		}

		return {
			title: '查看Issue' + (issueLinks.length > 1 ? ELLIPSIS : ''),
			visible: issueLinks.length > 0,
			onClick: () => {
				if (issueLinks.length > 1) {
					dialog.showSelect('选择你想要查看该分支的哪个issue:', '0', issueLinks.map((issueLink, i) => ({ name: issueLink.displayText, value: i.toString() })), '查看Issue', (value) => {
						sendMessage({ command: 'openExternalUrl', url: issueLinks[parseInt(value)].url });
					}, target);
				} else if (issueLinks.length === 1) {
					sendMessage({ command: 'openExternalUrl', url: issueLinks[0].url });
				}
			}
		};
	}


	/* Actions */

	private addTagAction(hash: string, initialName: string, initialType: GG.TagType, initialMessage: string, initialPushToRemote: string | null, target: DialogTarget & CommitTarget, isInitialLoad: boolean = true) {
		let mostRecentTagsIndex = -1;
		for (let i = 0; i < this.commits.length; i++) {
			if (this.commits[i].tags.length > 0 && (mostRecentTagsIndex === -1 || this.commits[i].date > this.commits[mostRecentTagsIndex].date)) {
				mostRecentTagsIndex = i;
			}
		}
		const mostRecentTags = mostRecentTagsIndex > -1 ? this.commits[mostRecentTagsIndex].tags.map((tag) => '"' + tag.name + '"') : [];

		const inputs: DialogInput[] = [
			{ type: DialogInputType.TextRef, name: '名称', default: initialName, info: mostRecentTags.length > 0 ? '在加载的提交中' + (mostRecentTags.length > 1 ? 's' : '') + '最近的标签' + (mostRecentTags.length > 1 ? '是' : '是') + ' ' + formatCommaSeparatedList(mostRecentTags) + '.' : undefined },
			{ type: DialogInputType.Select, name: '类型', default: initialType === GG.TagType.Annotated ? 'annotated' : 'lightweight', options: [{ name: '带注释', value: '带注释' }, { name: '轻量级的', value: '轻量级的' }] },
			{ type: DialogInputType.Text, name: '消息', default: initialMessage, placeholder: '可选择', info: '消息只能添加到带注释的标记中' }
		];
		if (this.gitRemotes.length > 1) {
			const options = [{ name: '不要推送', value: '-1' }];
			this.gitRemotes.forEach((remote, i) => options.push({ name: remote, value: i.toString() }));
			const defaultOption = initialPushToRemote !== null
				? this.gitRemotes.indexOf(initialPushToRemote)
				: isInitialLoad && this.config.dialogDefaults.addTag.pushToRemote
					? this.gitRemotes.indexOf(this.getPushRemote())
					: -1;
			inputs.push({ type: DialogInputType.Select, name: '推送到远程仓库分支', options: options, default: defaultOption.toString(), info: '一旦这个标签被添加，就把它推送到远程仓库中' });
		} else if (this.gitRemotes.length === 1) {
			const defaultValue = initialPushToRemote !== null || (isInitialLoad && this.config.dialogDefaults.addTag.pushToRemote);
			inputs.push({ type: DialogInputType.Checkbox, name: '推送到远程仓库分支', value: defaultValue, info: '一旦这个标签被添加，就将其推送到远程仓库中' });
		}

		dialog.showForm('给 <b><i>' + abbrevCommit(hash) + '</i></b> 提交添加标签:', inputs, '添加标签', (values) => {
			const tagName = <string>values[0];
			const type = <string>values[1] === 'annotated' ? GG.TagType.Annotated : GG.TagType.Lightweight;
			const message = <string>values[2];
			const pushToRemote = this.gitRemotes.length > 1 && <string>values[3] !== '-1'
				? this.gitRemotes[parseInt(<string>values[3])]
				: this.gitRemotes.length === 1 && <boolean>values[3]
					? this.gitRemotes[0]
					: null;

			const runAddTagAction = (force: boolean) => {
				runAction({
					command: 'addTag',
					repo: this.currentRepo,
					tagName: tagName,
					commitHash: hash,
					type: type,
					message: message,
					pushToRemote: pushToRemote,
					pushSkipRemoteCheck: globalState.pushTagSkipRemoteCheck,
					force: force
				}, '正在添加标签');
			};

			if (this.gitTags.includes(tagName)) {
				dialog.showTwoButtons('标签名 <b><i>' + escapeHtml(tagName) + '</i></b> 已经存在, 你想用这个新标签替换它吗?', '是的，替换现有的标签', () => {
					runAddTagAction(true);
				}, '不，选择另一个标签名', () => {
					this.addTagAction(hash, tagName, type, message, pushToRemote, target, false);
				}, target);
			} else {
				runAddTagAction(false);
			}
		}, target);
	}

	private checkoutBranchAction(refName: string, remote: string | null, prefillName: string | null, target: DialogTarget & (CommitTarget | RefTarget)) {
		if (remote !== null) {
			dialog.showRefInput('输入切换时要创建的新分支的名称 <b><i>' + escapeHtml(refName) + '</i></b>:', (prefillName !== null ? prefillName : (remote !== '' ? refName.substring(remote.length + 1) : refName)), '切换分支', newBranch => {
				if (this.gitBranches.includes(newBranch)) {
					const canPullFromRemote = remote !== '';
					dialog.showTwoButtons('这个名称 <b><i>' + escapeHtml(newBranch) + '</i></b> 已被另一个分支使用:', '选择其他的分支名称', () => {
						this.checkoutBranchAction(refName, remote, newBranch, target);
					}, '切换现有的分支' + (canPullFromRemote ? ' & 改变拉取' : ''), () => {
						runAction({
							command: 'checkoutBranch',
							repo: this.currentRepo,
							branchName: newBranch,
							remoteBranch: null,
							pullAfterwards: canPullFromRemote
								? {
									branchName: refName.substring(remote.length + 1),
									remote: remote,
									createNewCommit: this.config.dialogDefaults.pullBranch.noFastForward,
									squash: this.config.dialogDefaults.pullBranch.squash
								}
								: null
						}, '正在切换分支' + (canPullFromRemote ? ' & 正在拉取更改' : ''));
					}, target);
				} else {
					runAction({ command: 'checkoutBranch', repo: this.currentRepo, branchName: newBranch, remoteBranch: refName, pullAfterwards: null }, '正在切换分支');
				}
			}, target);
		} else {
			runAction({ command: 'checkoutBranch', repo: this.currentRepo, branchName: refName, remoteBranch: null, pullAfterwards: null }, '正在切换分支');
		}
	}

	private createBranchAction(hash: string, initialName: string, initialCheckOut: boolean, target: DialogTarget & CommitTarget) {
		dialog.showForm('在提交 <b><i>' + abbrevCommit(hash) + '</i></b> 时创建分支:', [
			{ type: DialogInputType.TextRef, name: '名称', default: initialName },
			{ type: DialogInputType.Checkbox, name: '切换', value: initialCheckOut }
		], '创建分支', (values) => {
			const branchName = <string>values[0], checkOut = <boolean>values[1];
			if (this.gitBranches.includes(branchName)) {
				dialog.showTwoButtons('一个名为 <b><i>' + escapeHtml(branchName) + '</i></b> 的分支已经存在, 你想用这个新的分支替换它吗?', '是的，替换现有的分支', () => {
					runAction({ command: 'createBranch', repo: this.currentRepo, branchName: branchName, commitHash: hash, checkout: checkOut, force: true }, '正在创建分支');
				}, '不, 选择另一个分支名称', () => {
					this.createBranchAction(hash, branchName, checkOut, target);
				}, target);
			} else {
				runAction({ command: 'createBranch', repo: this.currentRepo, branchName: branchName, commitHash: hash, checkout: checkOut, force: false }, '正在创建分支');
			}
		}, target);
	}

	private deleteTagAction(refName: string, deleteOnRemote: string | null) {
		runAction({ command: 'deleteTag', repo: this.currentRepo, tagName: refName, deleteOnRemote: deleteOnRemote }, '正在删除标签');
	}

	private fetchFromRemotesAction() {
		runAction({ command: 'fetch', repo: this.currentRepo, name: null, prune: this.config.fetchAndPrune, pruneTags: this.config.fetchAndPruneTags }, '从远程获取');
	}

	private mergeAction(obj: string, name: string, actionOn: GG.MergeActionOn, target: DialogTarget & (CommitTarget | RefTarget)) {
		dialog.showForm('你确定要合并吗 ' + actionOn.toLowerCase() + ' <b><i>' + escapeHtml(name) + '</i></b> 到 ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (当前分支)' : '当前分支') + '?', [
			{ type: DialogInputType.Checkbox, name: '创建一个新的提交，即使快进是可能的(Create a new commit even if fast-forward is possible)', value: this.config.dialogDefaults.merge.noFastForward },
			{ type: DialogInputType.Checkbox, name: 'Squash Commits(控制提交)', value: this.config.dialogDefaults.merge.squash, info: '在当前分支上创建单独提交，其效果与合并此提交相同' + actionOn.toLowerCase() + '.' },
			{ type: DialogInputType.Checkbox, name: '不提交', value: this.config.dialogDefaults.merge.noCommit, info: '合并的更改将被暂存，但不会被提交，因此你可以在提交之前检查或修改合并的结果' }
		], 'Yes, merge', (values) => {
			runAction({ command: 'merge', repo: this.currentRepo, obj: obj, actionOn: actionOn, createNewCommit: <boolean>values[0], squash: <boolean>values[1], noCommit: <boolean>values[2] }, '正在合并 ' + actionOn);
		}, target);
	}

	private rebaseAction(obj: string, name: string, actionOn: GG.RebaseActionOn, target: DialogTarget & (CommitTarget | RefTarget)) {
		dialog.showForm('你确定想复位(rebase) ' + (this.gitBranchHead !== null ? '<b><i>' + escapeHtml(this.gitBranchHead) + '</i></b> (当前分支)' : '当前分支') + ' on ' + actionOn.toLowerCase() + ' <b><i>' + escapeHtml(name) + '</i></b>?', [
			{ type: DialogInputType.Checkbox, name: '在新终端启动交互式重基(Interactive Rebase)', value: this.config.dialogDefaults.rebase.interactive },
			{ type: DialogInputType.Checkbox, name: '忽略日期', value: this.config.dialogDefaults.rebase.ignoreDate, info: '仅适用于非交互式重基(non-interactive rebase)、' }
		], '是，复位', (values) => {
			let interactive = <boolean>values[0];
			runAction({ command: 'rebase', repo: this.currentRepo, obj: obj, actionOn: actionOn, ignoreDate: <boolean>values[1], interactive: interactive }, interactive ? 'Launching Interactive Rebase' : 'Rebasing on ' + actionOn);
		}, target);
	}


	/* Table Utils */

	private makeTableResizable() {
		let colHeadersElem = document.getElementById('tableColHeaders')!, cols = <HTMLCollectionOf<HTMLElement>>document.getElementsByClassName('tableColHeader');
		let columnWidths: GG.ColumnWidth[], mouseX = -1, col = -1, colIndex = -1;

		const makeTableFixedLayout = () => {
			cols[0].style.width = columnWidths[0] + 'px';
			cols[0].style.padding = '';
			for (let i = 2; i < cols.length; i++) {
				cols[i].style.width = columnWidths[parseInt(cols[i].dataset.col!)] + 'px';
			}
			this.tableElem.className = 'fixedLayout';
			this.tableElem.style.removeProperty(CSS_PROP_LIMIT_GRAPH_WIDTH);
			this.graph.limitMaxWidth(columnWidths[0] + COLUMN_LEFT_RIGHT_PADDING);
		};

		for (let i = 0; i < cols.length; i++) {
			let col = parseInt(cols[i].dataset.col!);
			cols[i].innerHTML += (i > 0 ? '<span class="resizeCol left" data-col="' + (col - 1) + '"></span>' : '') + (i < cols.length - 1 ? '<span class="resizeCol right" data-col="' + col + '"></span>' : '');
		}

		let cWidths = this.gitRepos[this.currentRepo].columnWidths;
		if (cWidths === null) { // Initialise auto column layout if it is the first time viewing the repo.
			let defaults = this.config.defaultColumnVisibility;
			columnWidths = [COLUMN_AUTO, COLUMN_AUTO, defaults.date ? COLUMN_AUTO : COLUMN_HIDDEN, defaults.author ? COLUMN_AUTO : COLUMN_HIDDEN, defaults.commit ? COLUMN_AUTO : COLUMN_HIDDEN];
			this.saveColumnWidths(columnWidths);
		} else {
			columnWidths = [cWidths[0], COLUMN_AUTO, cWidths[1], cWidths[2], cWidths[3]];
		}

		if (columnWidths[0] !== COLUMN_AUTO) {
			// Table should have fixed layout
			makeTableFixedLayout();
		} else {
			// Table should have automatic layout
			this.tableElem.className = 'autoLayout';

			let colWidth = cols[0].offsetWidth, graphWidth = this.graph.getContentWidth();
			let maxWidth = Math.round(this.viewElem.clientWidth * 0.333);
			if (Math.max(graphWidth, colWidth) > maxWidth) {
				this.graph.limitMaxWidth(maxWidth);
				graphWidth = maxWidth;
				this.tableElem.className += ' limitGraphWidth';
				this.tableElem.style.setProperty(CSS_PROP_LIMIT_GRAPH_WIDTH, maxWidth + 'px');
			} else {
				this.graph.limitMaxWidth(-1);
				this.tableElem.style.removeProperty(CSS_PROP_LIMIT_GRAPH_WIDTH);
			}

			if (colWidth < Math.max(graphWidth, 64)) {
				cols[0].style.padding = '6px ' + Math.floor((Math.max(graphWidth, 64) - (colWidth - COLUMN_LEFT_RIGHT_PADDING)) / 2) + 'px';
			}
		}

		const processResizingColumn: EventListener = (e) => {
			if (col > -1) {
				let mouseEvent = <MouseEvent>e;
				let mouseDeltaX = mouseEvent.clientX - mouseX;

				if (col === 0) {
					if (columnWidths[0] + mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = -columnWidths[0] + COLUMN_MIN_WIDTH;
					if (cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING - mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING - COLUMN_MIN_WIDTH;
					columnWidths[0] += mouseDeltaX;
					cols[0].style.width = columnWidths[0] + 'px';
					this.graph.limitMaxWidth(columnWidths[0] + COLUMN_LEFT_RIGHT_PADDING);
				} else {
					let colWidth = col !== 1 ? columnWidths[col] : cols[1].clientWidth - COLUMN_LEFT_RIGHT_PADDING;
					let nextCol = col + 1;
					while (columnWidths[nextCol] === COLUMN_HIDDEN) nextCol++;

					if (colWidth + mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = -colWidth + COLUMN_MIN_WIDTH;
					if (columnWidths[nextCol] - mouseDeltaX < COLUMN_MIN_WIDTH) mouseDeltaX = columnWidths[nextCol] - COLUMN_MIN_WIDTH;
					if (col !== 1) {
						columnWidths[col] += mouseDeltaX;
						cols[colIndex].style.width = columnWidths[col] + 'px';
					}
					columnWidths[nextCol] -= mouseDeltaX;
					cols[colIndex + 1].style.width = columnWidths[nextCol] + 'px';
				}
				mouseX = mouseEvent.clientX;
			}
		};
		const stopResizingColumn: EventListener = () => {
			if (col > -1) {
				col = -1;
				colIndex = -1;
				mouseX = -1;
				eventOverlay.remove();
				this.saveColumnWidths(columnWidths);
			}
		};

		addListenerToClass('resizeCol', 'mousedown', (e) => {
			if (e.target === null) return;
			col = parseInt((<HTMLElement>e.target).dataset.col!);
			while (columnWidths[col] === COLUMN_HIDDEN) col--;
			mouseX = (<MouseEvent>e).clientX;

			let isAuto = columnWidths[0] === COLUMN_AUTO;
			for (let i = 0; i < cols.length; i++) {
				let curCol = parseInt(cols[i].dataset.col!);
				if (isAuto && curCol !== 1) columnWidths[curCol] = cols[i].clientWidth - COLUMN_LEFT_RIGHT_PADDING;
				if (curCol === col) colIndex = i;
			}
			if (isAuto) makeTableFixedLayout();
			eventOverlay.create('colResize', processResizingColumn, stopResizingColumn);
		});

		colHeadersElem.addEventListener('contextmenu', (e: MouseEvent) => {
			handledEvent(e);

			const toggleColumnState = (col: number, defaultWidth: number) => {
				columnWidths[col] = columnWidths[col] !== COLUMN_HIDDEN ? COLUMN_HIDDEN : columnWidths[0] === COLUMN_AUTO ? COLUMN_AUTO : defaultWidth - COLUMN_LEFT_RIGHT_PADDING;
				this.saveColumnWidths(columnWidths);
				this.render();
			};

			const commitOrdering = getCommitOrdering(this.gitRepos[this.currentRepo].commitOrdering);
			const changeCommitOrdering = (repoCommitOrdering: GG.RepoCommitOrdering) => {
				this.saveRepoStateValue(this.currentRepo, 'commitOrdering', repoCommitOrdering);
				this.refresh(true);
			};

			contextMenu.show([
				[
					{
						title: '时间',
						visible: true,
						checked: columnWidths[2] !== COLUMN_HIDDEN,
						onClick: () => toggleColumnState(2, 128)
					},
					{
						title: '作者',
						visible: true,
						checked: columnWidths[3] !== COLUMN_HIDDEN,
						onClick: () => toggleColumnState(3, 128)
					},
					{
						title: '提交',
						visible: true,
						checked: columnWidths[4] !== COLUMN_HIDDEN,
						onClick: () => toggleColumnState(4, 80)
					}
				],
				[
					{
						title: '提交时间戳排序',
						visible: true,
						checked: commitOrdering === GG.CommitOrdering.Date,
						onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.Date)
					},
					{
						title: '作者的时间戳排序',
						visible: true,
						checked: commitOrdering === GG.CommitOrdering.AuthorDate,
						onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.AuthorDate)
					},
					{
						title: '拓扑排序',
						visible: true,
						checked: commitOrdering === GG.CommitOrdering.Topological,
						onClick: () => changeCommitOrdering(GG.RepoCommitOrdering.Topological)
					}
				]
			], true, null, e, this.viewElem);
		});
	}

	public getColumnVisibility() {
		let colWidths = this.gitRepos[this.currentRepo].columnWidths;
		if (colWidths !== null) {
			return { date: colWidths[1] !== COLUMN_HIDDEN, author: colWidths[2] !== COLUMN_HIDDEN, commit: colWidths[3] !== COLUMN_HIDDEN };
		} else {
			let defaults = this.config.defaultColumnVisibility;
			return { date: defaults.date, author: defaults.author, commit: defaults.commit };
		}
	}

	private getNumColumns() {
		let colVisibility = this.getColumnVisibility();
		return 2 + (colVisibility.date ? 1 : 0) + (colVisibility.author ? 1 : 0) + (colVisibility.commit ? 1 : 0);
	}

	/**
	 * Scroll the view to the previous or next stash.
	 * @param next TRUE => Jump to the next stash, FALSE => Jump to the previous stash.
	 */
	private scrollToStash(next: boolean) {
		const stashCommits = this.commits.filter((commit) => commit.stash !== null);
		if (stashCommits.length > 0) {
			const curTime = (new Date()).getTime();
			if (this.lastScrollToStash.time < curTime - 5000) {
				// Reset the lastScrollToStash hash if it was more than 5 seconds ago
				this.lastScrollToStash.hash = null;
			}

			const lastScrollToStashCommitIndex = this.lastScrollToStash.hash !== null
				? stashCommits.findIndex((commit) => commit.hash === this.lastScrollToStash.hash)
				: -1;
			let scrollToStashCommitIndex = lastScrollToStashCommitIndex + (next ? 1 : -1);
			if (scrollToStashCommitIndex >= stashCommits.length) {
				scrollToStashCommitIndex = 0;
			} else if (scrollToStashCommitIndex < 0) {
				scrollToStashCommitIndex = stashCommits.length - 1;
			}
			this.scrollToCommit(stashCommits[scrollToStashCommitIndex].hash, true, true);
			this.lastScrollToStash.time = curTime;
			this.lastScrollToStash.hash = stashCommits[scrollToStashCommitIndex].hash;
		}
	}

	/**
	 * Scroll the view to a commit (if it exists).
	 * @param hash The hash of the commit to scroll to.
	 * @param alwaysCenterCommit TRUE => Always scroll the view to be centered on the commit. FALSE => Don't scroll the view if the commit is already within the visible portion of commits.
	 * @param flash Should the commit flash after it has been scrolled to.
	 */
	public scrollToCommit(hash: string, alwaysCenterCommit: boolean, flash: boolean = false) {
		const elem = findCommitElemWithId(getCommitElems(), this.getCommitId(hash));
		if (elem === null) return;

		let elemTop = this.controlsElem.clientHeight + elem.offsetTop;
		if (alwaysCenterCommit || elemTop - 8 < this.viewElem.scrollTop || elemTop + 32 - this.viewElem.clientHeight > this.viewElem.scrollTop) {
			this.viewElem.scroll(0, this.controlsElem.clientHeight + elem.offsetTop + 12 - this.viewElem.clientHeight / 2);
		}

		if (flash && !elem.classList.contains('flash')) {
			elem.classList.add('flash');
			setTimeout(() => {
				elem.classList.remove('flash');
			}, 850);
		}
	}

	private loadMoreCommits() {
		this.footerElem.innerHTML = '<h2 id="loadingHeader">' + SVG_ICONS.loading + '加载中...</h2>';
		this.maxCommits += this.config.loadMoreCommits;
		this.saveState();
		this.requestLoadRepoInfoAndCommits(false, true);
	}


	/* Observers */

	private observeWindowSizeChanges() {
		let windowWidth = window.outerWidth, windowHeight = window.outerHeight;
		window.addEventListener('resize', () => {
			if (windowWidth === window.outerWidth && windowHeight === window.outerHeight) {
				this.renderGraph();
			} else {
				windowWidth = window.outerWidth;
				windowHeight = window.outerHeight;
			}
		});
	}

	private observeWebviewStyleChanges() {
		let fontFamily = getVSCodeStyle(CSS_PROP_FONT_FAMILY),
			editorFontFamily = getVSCodeStyle(CSS_PROP_EDITOR_FONT_FAMILY),
			findMatchColour = getVSCodeStyle(CSS_PROP_FIND_MATCH_HIGHLIGHT_BACKGROUND),
			selectionBackgroundColor = !!getVSCodeStyle(CSS_PROP_SELECTION_BACKGROUND);

		const setFlashColour = (colour: string) => {
			document.body.style.setProperty('--git-graph-flashPrimary', modifyColourOpacity(colour, 0.7));
			document.body.style.setProperty('--git-graph-flashSecondary', modifyColourOpacity(colour, 0.5));
		};
		const setSelectionBackgroundColorExists = () => {
			alterClass(document.body, 'selection-background-color-exists', selectionBackgroundColor);
		};

		this.findWidget.setColour(findMatchColour);
		setFlashColour(findMatchColour);
		setSelectionBackgroundColorExists();

		(new MutationObserver(() => {
			let ff = getVSCodeStyle(CSS_PROP_FONT_FAMILY),
				eff = getVSCodeStyle(CSS_PROP_EDITOR_FONT_FAMILY),
				fmc = getVSCodeStyle(CSS_PROP_FIND_MATCH_HIGHLIGHT_BACKGROUND),
				sbc = !!getVSCodeStyle(CSS_PROP_SELECTION_BACKGROUND);

			if (ff !== fontFamily || eff !== editorFontFamily) {
				fontFamily = ff;
				editorFontFamily = eff;
				this.repoDropdown.refresh();
				this.branchDropdown.refresh();
			}
			if (fmc !== findMatchColour) {
				findMatchColour = fmc;
				this.findWidget.setColour(findMatchColour);
				setFlashColour(findMatchColour);
			}
			if (selectionBackgroundColor !== sbc) {
				selectionBackgroundColor = sbc;
				setSelectionBackgroundColorExists();
			}
		})).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
	}

	private observeViewScroll() {
		let active = this.viewElem.scrollTop > 0, timeout: NodeJS.Timer | null = null;
		this.scrollShadowElem.className = active ? CLASS_ACTIVE : '';
		this.viewElem.addEventListener('scroll', () => {
			const scrollTop = this.viewElem.scrollTop;
			if (active !== scrollTop > 0) {
				active = scrollTop > 0;
				this.scrollShadowElem.className = active ? CLASS_ACTIVE : '';
			}

			if (this.config.loadMoreCommitsAutomatically && this.moreCommitsAvailable && !this.currentRepoRefreshState.inProgress) {
				const viewHeight = this.viewElem.clientHeight, contentHeight = this.viewElem.scrollHeight;
				if (scrollTop > 0 && viewHeight > 0 && contentHeight > 0 && (scrollTop + viewHeight) >= contentHeight - 25) {
					// If the user has scrolled such that the bottom of the visible view is within 25px of the end of the content, load more commits.
					this.loadMoreCommits();
				}
			}

			if (timeout !== null) clearTimeout(timeout);
			timeout = setTimeout(() => {
				this.scrollTop = scrollTop;
				this.saveState();
				timeout = null;
			}, 250);
		});
	}

	private observeKeyboardEvents() {
		document.addEventListener('keydown', (e) => {
			if (contextMenu.isOpen()) {
				if (e.key === 'Escape') {
					contextMenu.close();
					handledEvent(e);
				}
			} else if (dialog.isOpen()) {
				if (e.key === 'Escape') {
					dialog.close();
					handledEvent(e);
				} else if (e.keyCode ? e.keyCode === 13 : e.key === 'Enter') {
					// Use keyCode === 13 to detect 'Enter' events if available (for compatibility with IME Keyboards used by Chinese / Japanese / Korean users)
					dialog.submit();
					handledEvent(e);
				}
			} else if (this.expandedCommit !== null && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				const curHashIndex = this.commitLookup[this.expandedCommit.commitHash];
				let newHashIndex = -1;

				if (e.ctrlKey || e.metaKey) {
					// Up / Down navigates according to the order of commits on the branch
					if (e.shiftKey) {
						// Follow commits on alternative branches when possible
						if (e.key === 'ArrowUp') {
							newHashIndex = this.graph.getAlternativeChildIndex(curHashIndex);
						} else if (e.key === 'ArrowDown') {
							newHashIndex = this.graph.getAlternativeParentIndex(curHashIndex);
						}
					} else {
						// Follow commits on the same branch
						if (e.key === 'ArrowUp') {
							newHashIndex = this.graph.getFirstChildIndex(curHashIndex);
						} else if (e.key === 'ArrowDown') {
							newHashIndex = this.graph.getFirstParentIndex(curHashIndex);
						}
					}
				} else {
					// Up / Down navigates according to the order of commits in the table
					if (e.key === 'ArrowUp' && curHashIndex > 0) {
						newHashIndex = curHashIndex - 1;
					} else if (e.key === 'ArrowDown' && curHashIndex < this.commits.length - 1) {
						newHashIndex = curHashIndex + 1;
					}
				}

				if (newHashIndex > -1) {
					handledEvent(e);
					const elem = findCommitElemWithId(getCommitElems(), newHashIndex);
					if (elem !== null) this.loadCommitDetails(elem);
				}
			} else if (e.key && (e.ctrlKey || e.metaKey)) {
				const key = e.key.toLowerCase(), keybindings = this.config.keybindings;
				if (key === keybindings.scrollToStash) {
					this.scrollToStash(!e.shiftKey);
					handledEvent(e);
				} else if (!e.shiftKey) {
					if (key === keybindings.refresh) {
						this.refresh(true, true);
						handledEvent(e);
					} else if (key === keybindings.find) {
						this.findWidget.show(true);
						handledEvent(e);
					} else if (key === keybindings.scrollToHead && this.commitHead !== null) {
						this.scrollToCommit(this.commitHead, true, true);
						handledEvent(e);
					}
				}
			} else if (e.key === 'Escape') {
				if (this.repoDropdown.isOpen()) {
					this.repoDropdown.close();
					handledEvent(e);
				} else if (this.branchDropdown.isOpen()) {
					this.branchDropdown.close();
					handledEvent(e);
				} else if (this.settingsWidget.isVisible()) {
					this.settingsWidget.close();
					handledEvent(e);
				} else if (this.findWidget.isVisible()) {
					this.findWidget.close();
					handledEvent(e);
				} else if (this.expandedCommit !== null) {
					this.closeCommitDetails(true);
					handledEvent(e);
				}
			}
		});
	}

	private observeUrls() {
		const followInternalLink = (e: MouseEvent) => {
			if (e.target !== null && isInternalUrlElem(<Element>e.target)) {
				const value = unescapeHtml((<HTMLElement>e.target).dataset.value!);
				switch ((<HTMLElement>e.target).dataset.type!) {
					case 'commit':
						if (typeof this.commitLookup[value] === 'number' && (this.expandedCommit === null || this.expandedCommit.commitHash !== value || this.expandedCommit.compareWithHash !== null)) {
							const elem = findCommitElemWithId(getCommitElems(), this.commitLookup[value]);
							if (elem !== null) this.loadCommitDetails(elem);
						}
						break;
				}
			}
		};

		document.body.addEventListener('click', followInternalLink);

		document.body.addEventListener('contextmenu', (e: MouseEvent) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;

			const isExternalUrl = isExternalUrlElem(eventTarget), isInternalUrl = isInternalUrlElem(eventTarget);
			if (isExternalUrl || isInternalUrl) {
				const viewElem: HTMLElement | null = eventTarget.closest('#view');
				let eventElem: HTMLElement | null;

				let target: (ContextMenuTarget & CommitTarget) | RepoTarget, isInDialog = false;
				if (this.expandedCommit !== null && eventTarget.closest('#cdv') !== null) {
					// URL is in the Commit Details View
					target = {
						type: TargetType.CommitDetailsView,
						hash: this.expandedCommit.commitHash,
						index: this.commitLookup[this.expandedCommit.commitHash],
						elem: <HTMLElement>eventTarget
					};
					GitGraphView.closeCdvContextMenuIfOpen(this.expandedCommit);
					this.expandedCommit.contextMenuOpen.summary = true;
				} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
					// URL is in the Commits
					const commit = this.getCommitOfElem(eventElem);
					if (commit === null) return;
					target = {
						type: TargetType.Commit,
						hash: commit.hash,
						index: parseInt(eventElem.dataset.id!),
						elem: <HTMLElement>eventTarget
					};
				} else {
					// URL is in a dialog
					target = {
						type: TargetType.Repo
					};
					isInDialog = true;
				}

				handledEvent(e);
				contextMenu.show([
					[
						{
							title: '打开URL',
							visible: isExternalUrl,
							onClick: () => {
								sendMessage({ command: 'openExternalUrl', url: (<HTMLAnchorElement>eventTarget).href });
							}
						},
						{
							title: '跟随内部链接',
							visible: isInternalUrl,
							onClick: () => followInternalLink(e)
						},
						{
							title: '复制URL到剪切板',
							visible: isExternalUrl,
							onClick: () => {
								sendMessage({ command: 'copyToClipboard', type: 'External URL', data: (<HTMLAnchorElement>eventTarget).href });
							}
						}
					]
				], false, target, e, viewElem || document.body, () => {
					if (target.type === TargetType.CommitDetailsView && this.expandedCommit !== null) {
						this.expandedCommit.contextMenuOpen.summary = false;
					}
				}, isInDialog ? 'dialogContextMenu' : null);
			}
		});
	}

	private observeTableEvents() {

		// Register Click Event Handler
		this.tableElem.addEventListener('click', (e: MouseEvent) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;
			if (isUrlElem(eventTarget)) return;
			let eventElem: HTMLElement | null;

			if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
				// .gitRef was clicked
				e.stopPropagation();
				if (contextMenu.isOpen()) {
					contextMenu.close();
				}

			} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
				// .commit was clicked
				if (this.expandedCommit !== null) {
					const commit = this.getCommitOfElem(eventElem);
					if (commit === null) return;

					if (this.expandedCommit.commitHash === commit.hash) {
						this.closeCommitDetails(true);
					} else if ((<MouseEvent>e).ctrlKey || (<MouseEvent>e).metaKey) {
						if (this.expandedCommit.compareWithHash === commit.hash) {
							this.closeCommitComparison(true);
						} else if (this.expandedCommit.commitElem !== null) {
							this.loadCommitComparison(this.expandedCommit.commitElem, eventElem);
						}
					} else {
						this.loadCommitDetails(eventElem);
					}
				} else {
					this.loadCommitDetails(eventElem);
				}
			}
		});

		// Register Double Click Event Handler
		this.tableElem.addEventListener('dblclick', (e: MouseEvent) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;
			if (isUrlElem(eventTarget)) return;
			let eventElem: HTMLElement | null;

			if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
				// .gitRef was double clicked
				e.stopPropagation();
				closeDialogAndContextMenu();
				const commitElem = <HTMLElement>eventElem.closest('.commit')!;
				const commit = this.getCommitOfElem(commitElem);
				if (commit === null) return;

				if (eventElem.classList.contains(CLASS_REF_HEAD) || eventElem.classList.contains(CLASS_REF_REMOTE)) {
					let sourceElem = <HTMLElement>eventElem.children[1];
					let refName = unescapeHtml(eventElem.dataset.name!), isHead = eventElem.classList.contains(CLASS_REF_HEAD), isRemoteCombinedWithHead = eventTarget.classList.contains('gitRefHeadRemote');
					if (isHead && isRemoteCombinedWithHead) {
						refName = unescapeHtml((<HTMLElement>eventTarget).dataset.fullref!);
						sourceElem = <HTMLElement>eventTarget;
						isHead = false;
					}

					const target: ContextMenuTarget & DialogTarget & RefTarget = {
						type: TargetType.Ref,
						hash: commit.hash,
						index: parseInt(commitElem.dataset.id!),
						ref: refName,
						elem: sourceElem
					};

					this.checkoutBranchAction(refName, isHead ? null : unescapeHtml((isRemoteCombinedWithHead ? <HTMLElement>eventTarget : eventElem).dataset.remote!), null, target);
				}
			}
		});

		// Register ContextMenu Event Handler
		this.tableElem.addEventListener('contextmenu', (e: Event) => {
			if (e.target === null) return;
			const eventTarget = <Element>e.target;
			if (isUrlElem(eventTarget)) return;
			let eventElem: HTMLElement | null;

			if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
				// .gitRef was right clicked
				handledEvent(e);
				const commitElem = <HTMLElement>eventElem.closest('.commit')!;
				const commit = this.getCommitOfElem(commitElem);
				if (commit === null) return;

				const target: ContextMenuTarget & DialogTarget & RefTarget = {
					type: TargetType.Ref,
					hash: commit.hash,
					index: parseInt(commitElem.dataset.id!),
					ref: unescapeHtml(eventElem.dataset.name!),
					elem: <HTMLElement>eventElem.children[1]
				};

				let actions: ContextMenuActions;
				if (eventElem.classList.contains(CLASS_REF_STASH)) {
					actions = this.getStashContextMenuActions(target);
				} else if (eventElem.classList.contains(CLASS_REF_TAG)) {
					actions = this.getTagContextMenuActions(eventElem.dataset.tagtype === 'annotated', target);
				} else {
					let isHead = eventElem.classList.contains(CLASS_REF_HEAD), isRemoteCombinedWithHead = eventTarget.classList.contains('gitRefHeadRemote');
					if (isHead && isRemoteCombinedWithHead) {
						target.ref = unescapeHtml((<HTMLElement>eventTarget).dataset.fullref!);
						target.elem = <HTMLElement>eventTarget;
						isHead = false;
					}
					if (isHead) {
						actions = this.getBranchContextMenuActions(target);
					} else {
						const remote = unescapeHtml((isRemoteCombinedWithHead ? <HTMLElement>eventTarget : eventElem).dataset.remote!);
						actions = this.getRemoteBranchContextMenuActions(remote, target);
					}
				}

				contextMenu.show(actions, false, target, <MouseEvent>e, this.viewElem);

			} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
				// .commit was right clicked
				handledEvent(e);
				const commit = this.getCommitOfElem(eventElem);
				if (commit === null) return;

				const target: ContextMenuTarget & DialogTarget & CommitTarget = {
					type: TargetType.Commit,
					hash: commit.hash,
					index: parseInt(eventElem.dataset.id!),
					elem: eventElem
				};

				let actions: ContextMenuActions;
				if (commit.hash === UNCOMMITTED) {
					actions = this.getUncommittedChangesContextMenuActions(target);
				} else if (commit.stash !== null) {
					target.ref = commit.stash.selector;
					actions = this.getStashContextMenuActions(<RefTarget>target);
				} else {
					actions = this.getCommitContextMenuActions(target);
				}

				contextMenu.show(actions, false, target, <MouseEvent>e, this.viewElem);
			}
		});
	}


	/* Commit Details View */

	public loadCommitDetails(commitElem: HTMLElement) {
		const commit = this.getCommitOfElem(commitElem);
		if (commit === null) return;

		this.closeCommitDetails(false);
		this.saveExpandedCommitLoading(parseInt(commitElem.dataset.id!), commit.hash, commitElem, null, null);
		commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		this.renderCommitDetailsView(false);
		this.requestCommitDetails(commit.hash, false);
	}

	public closeCommitDetails(saveAndRender: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null) return;

		const elem = document.getElementById('cdv'), isDocked = this.isCdvDocked();
		if (elem !== null) {
			elem.remove();
		}
		if (isDocked) {
			this.viewElem.style.bottom = '0px';
		}
		if (expandedCommit.commitElem !== null) {
			expandedCommit.commitElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
		}
		if (expandedCommit.compareWithElem !== null) {
			expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
		}
		GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		this.expandedCommit = null;
		if (saveAndRender) {
			this.saveState();
			if (!isDocked) {
				this.renderGraph();
			}
		}
	}

	public showCommitDetails(commitDetails: GG.GitCommitDetails, fileTree: FileTreeFolder, avatar: string | null, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.commitHash !== commitDetails.hash || expandedCommit.compareWithHash !== null) return;

		if (!this.isCdvDocked()) {
			const elem = document.getElementById('cdv');
			if (elem !== null) elem.remove();
		}

		expandedCommit.commitDetails = commitDetails;
		if (haveFilesChanged(expandedCommit.fileChanges, commitDetails.fileChanges)) {
			expandedCommit.fileChanges = commitDetails.fileChanges;
			expandedCommit.fileTree = fileTree;
			GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		}
		expandedCommit.avatar = avatar;
		expandedCommit.codeReview = codeReview;
		if (!refresh) {
			expandedCommit.lastViewedFile = lastViewedFile;
		}
		expandedCommit.commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		expandedCommit.loading = false;
		this.saveState();

		this.renderCommitDetailsView(refresh);
	}

	public createFileTree(gitFiles: ReadonlyArray<GG.GitFileChange>, codeReview: GG.CodeReview | null) {
		let contents: FileTreeFolderContents = {}, i, j, path, absPath, cur: FileTreeFolder;
		let files: FileTreeFolder = { type: 'folder', name: '', folderPath: '', contents: contents, open: true, reviewed: true };

		for (i = 0; i < gitFiles.length; i++) {
			cur = files;
			path = gitFiles[i].newFilePath.split('/');
			absPath = this.currentRepo;
			for (j = 0; j < path.length; j++) {
				absPath += '/' + path[j];
				if (typeof this.gitRepos[absPath] !== 'undefined') {
					if (typeof cur.contents[path[j]] === 'undefined') {
						cur.contents[path[j]] = { type: 'repo', name: path[j], path: absPath };
					}
					break;
				} else if (j < path.length - 1) {
					if (typeof cur.contents[path[j]] === 'undefined') {
						contents = {};
						cur.contents[path[j]] = { type: 'folder', name: path[j], folderPath: absPath.substring(this.currentRepo.length + 1), contents: contents, open: true, reviewed: true };
					}
					cur = <FileTreeFolder>cur.contents[path[j]];
				} else if (path[j] !== '') {
					cur.contents[path[j]] = { type: 'file', name: path[j], index: i, reviewed: codeReview === null || !codeReview.remainingFiles.includes(gitFiles[i].newFilePath) };
				}
			}
		}
		if (codeReview !== null) calcFileTreeFoldersReviewed(files);
		return files;
	}


	/* Commit Comparison View */

	private loadCommitComparison(commitElem: HTMLElement, compareWithElem: HTMLElement) {
		const commit = this.getCommitOfElem(commitElem);
		const compareWithCommit = this.getCommitOfElem(compareWithElem);

		if (commit !== null && compareWithCommit !== null) {
			if (this.expandedCommit !== null) {
				if (this.expandedCommit.commitHash !== commit.hash) {
					this.closeCommitDetails(false);
				} else if (this.expandedCommit.compareWithHash !== compareWithCommit.hash) {
					this.closeCommitComparison(false);
				}
			}

			this.saveExpandedCommitLoading(parseInt(commitElem.dataset.id!), commit.hash, commitElem, compareWithCommit.hash, compareWithElem);
			commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
			compareWithElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
			this.renderCommitDetailsView(false);
			this.requestCommitComparison(commit.hash, compareWithCommit.hash, false);
		}
	}

	public closeCommitComparison(saveAndRequestCommitDetails: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.compareWithHash === null) return;

		if (expandedCommit.compareWithElem !== null) {
			expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
		}
		GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		if (saveAndRequestCommitDetails) {
			if (expandedCommit.commitElem !== null) {
				this.saveExpandedCommitLoading(expandedCommit.index, expandedCommit.commitHash, expandedCommit.commitElem, null, null);
				this.renderCommitDetailsView(false);
				this.requestCommitDetails(expandedCommit.commitHash, false);
			} else {
				this.closeCommitDetails(true);
			}
		}
	}

	public showCommitComparison(commitHash: string, compareWithHash: string, fileChanges: ReadonlyArray<GG.GitFileChange>, fileTree: FileTreeFolder, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.compareWithElem === null || expandedCommit.commitHash !== commitHash || expandedCommit.compareWithHash !== compareWithHash) return;

		if (haveFilesChanged(expandedCommit.fileChanges, fileChanges)) {
			expandedCommit.fileChanges = fileChanges;
			expandedCommit.fileTree = fileTree;
			GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		}
		expandedCommit.codeReview = codeReview;
		if (!refresh) {
			expandedCommit.lastViewedFile = lastViewedFile;
		}
		expandedCommit.commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		expandedCommit.compareWithElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		expandedCommit.loading = false;
		this.saveState();

		this.renderCommitDetailsView(refresh);
	}


	/* Render Commit Details / Comparison View */

	private renderCommitDetailsView(refresh: boolean) {
		const expandedCommit = this.expandedCommit;
		if (expandedCommit === null || expandedCommit.commitElem === null) return;

		let elem = document.getElementById('cdv'), html = '<div id="cdvContent">', isDocked = this.isCdvDocked();
		const commitOrder = this.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
		const codeReviewPossible = !expandedCommit.loading && commitOrder.to !== UNCOMMITTED;
		const externalDiffPossible = !expandedCommit.loading && (expandedCommit.compareWithHash !== null || this.commits[this.commitLookup[expandedCommit.commitHash]].parents.length > 0);

		if (elem === null) {
			elem = document.createElement(isDocked ? 'div' : 'tr');
			elem.id = 'cdv';
			elem.className = isDocked ? 'docked' : 'inline';
			this.setCdvHeight(elem, isDocked);
			if (isDocked) {
				document.body.appendChild(elem);
			} else {
				insertAfter(elem, expandedCommit.commitElem);
			}
		}

		if (expandedCommit.loading) {
			html += '<div id="cdvLoading">' + SVG_ICONS.loading + ' 加载中 ' + (expandedCommit.compareWithHash === null ? expandedCommit.commitHash !== UNCOMMITTED ? 'Commit Details' : 'Uncommitted Changes' : 'Commit Comparison') + ' ...</div>';
		} else {
			html += '<div id="cdvSummary">';
			if (expandedCommit.compareWithHash === null) {
				// Commit details should be shown
				if (expandedCommit.commitHash !== UNCOMMITTED) {
					const textFormatter = new TextFormatter(this.commits, this.gitRepos[this.currentRepo].issueLinkingConfig, {
						commits: true,
						emoji: true,
						issueLinking: true,
						markdown: this.config.markdown,
						multiline: true,
						urls: true
					});
					const commitDetails = expandedCommit.commitDetails!;
					const parents = commitDetails.parents.length > 0
						? commitDetails.parents.map((parent) => {
							const escapedParent = escapeHtml(parent);
							return typeof this.commitLookup[parent] === 'number'
								? '<span class="' + CLASS_INTERNAL_URL + '" data-type="commit" data-value="' + escapedParent + '" tabindex="-1">' + escapedParent + '</span>'
								: escapedParent;
						}).join(', ')
						: 'None';
					html += '<span class="cdvSummaryTop' + (expandedCommit.avatar !== null ? ' withAvatar' : '') + '"><span class="cdvSummaryTopRow"><span class="cdvSummaryKeyValues">'
						+ '<b>提交: </b>' + escapeHtml(commitDetails.hash) + '<br>'
						+ '<b>父节点: </b>' + parents + '<br>'
						+ '<b>作者: </b>' + escapeHtml(commitDetails.author) + (commitDetails.authorEmail !== '' ? ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(commitDetails.authorEmail) + '" tabindex="-1">' + escapeHtml(commitDetails.authorEmail) + '</a>&gt;' : '') + '<br>'
						+ (commitDetails.authorDate !== commitDetails.committerDate ? '<b>作者时间: </b>' + formatLongDate(commitDetails.authorDate) + '<br>' : '')
						+ '<b>提交人: </b>' + escapeHtml(commitDetails.committer) + (commitDetails.committerEmail !== '' ? ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(commitDetails.committerEmail) + '" tabindex="-1">' + escapeHtml(commitDetails.committerEmail) + '</a>&gt;' : '') + (commitDetails.signature !== null ? generateSignatureHtml(commitDetails.signature) : '') + '<br>'
						+ '<b>' + (commitDetails.authorDate !== commitDetails.committerDate ? 'Committer ' : '') + '时间: </b>' + formatLongDate(commitDetails.committerDate)
						+ '</span>'
						+ (expandedCommit.avatar !== null ? '<span class="cdvSummaryAvatar"><img src="' + expandedCommit.avatar + '"></span>' : '')
						+ '</span></span><br><br>' + textFormatter.format(commitDetails.body);
				} else {
					html += '显示所有未提交的更改';
				}
			} else {
				// Commit comparison should be shown
				html += '显示从 <b>' + commitOrder.from + '</b> 到 <b>' + (commitOrder.to !== UNCOMMITTED ? commitOrder.to : '未提交的更改的所有更改') + '</b>.';
			}
			html += '</div><div id="cdvFiles">' + generateFileViewHtml(expandedCommit.fileTree!, expandedCommit.fileChanges!, expandedCommit.lastViewedFile, expandedCommit.contextMenuOpen.fileView, this.getFileViewType(), commitOrder.to === UNCOMMITTED) + '</div><div id="cdvDivider"></div>';
		}
		html += '</div><div id="cdvControls"><div id="cdvClose" class="cdvControlBtn" title="关闭">' + SVG_ICONS.close + '</div>' +
			(codeReviewPossible ? '<div id="cdvCodeReview" class="cdvControlBtn">' + SVG_ICONS.review + '</div>' : '') +
			(!expandedCommit.loading ? '<div id="cdvFileViewTypeTree" class="cdvControlBtn cdvFileViewTypeBtn" title="文件树视图">' + SVG_ICONS.fileTree + '</div><div id="cdvFileViewTypeList" class="cdvControlBtn cdvFileViewTypeBtn" title="文件列表视图">' + SVG_ICONS.fileList + '</div>' : '') +
			(externalDiffPossible ? '<div id="cdvExternalDiff" class="cdvControlBtn">' + SVG_ICONS.linkExternal + '</div>' : '') +
			'</div><div class="cdvHeightResize"></div>';

		elem.innerHTML = isDocked ? html : '<td><div class="cdvHeightResize"></div></td><td colspan="' + (this.getNumColumns() - 1) + '">' + html + '</td>';
		if (!expandedCommit.loading) this.setCdvDivider();
		if (!isDocked) this.renderGraph();

		if (!refresh) {
			if (isDocked) {
				let elemTop = this.controlsElem.clientHeight + expandedCommit.commitElem.offsetTop;
				if (elemTop - 8 < this.viewElem.scrollTop) {
					// Commit is above what is visible on screen
					this.viewElem.scroll(0, elemTop - 8);
				} else if (elemTop - this.viewElem.clientHeight + 32 > this.viewElem.scrollTop) {
					// Commit is below what is visible on screen
					this.viewElem.scroll(0, elemTop - this.viewElem.clientHeight + 32);
				}
			} else {
				let elemTop = this.controlsElem.clientHeight + elem.offsetTop, cdvHeight = this.gitRepos[this.currentRepo].cdvHeight;
				if (this.config.commitDetailsView.autoCenter) {
					// Center Commit Detail View setting is enabled
					// elemTop - commit height [24px] + (commit details view height + commit height [24px]) / 2 - (view height) / 2
					this.viewElem.scroll(0, elemTop - 12 + (cdvHeight - this.viewElem.clientHeight) / 2);
				} else if (elemTop - 32 < this.viewElem.scrollTop) {
					// Commit Detail View is opening above what is visible on screen
					// elemTop - commit height [24px] - desired gap from top [8px] < view scroll offset
					this.viewElem.scroll(0, elemTop - 32);
				} else if (elemTop + cdvHeight - this.viewElem.clientHeight + 8 > this.viewElem.scrollTop) {
					// Commit Detail View is opening below what is visible on screen
					// elemTop + commit details view height + desired gap from bottom [8px] - view height > view scroll offset
					this.viewElem.scroll(0, elemTop + cdvHeight - this.viewElem.clientHeight + 8);
				}
			}
		}

		this.makeCdvResizable();
		document.getElementById('cdvClose')!.addEventListener('click', () => {
			this.closeCommitDetails(true);
		});

		if (!expandedCommit.loading) {
			this.makeCdvFileViewInteractive();
			this.renderCdvFileViewTypeBtns();
			this.renderCdvExternalDiffBtn();
			this.makeCdvDividerDraggable();

			observeElemScroll('cdvSummary', expandedCommit.scrollTop.summary, (scrollTop) => {
				if (this.expandedCommit === null) return;
				this.expandedCommit.scrollTop.summary = scrollTop;
				if (this.expandedCommit.contextMenuOpen.summary) {
					this.expandedCommit.contextMenuOpen.summary = false;
					contextMenu.close();
				}
			}, () => this.saveState());

			observeElemScroll('cdvFiles', expandedCommit.scrollTop.fileView, (scrollTop) => {
				if (this.expandedCommit === null) return;
				this.expandedCommit.scrollTop.fileView = scrollTop;
				if (this.expandedCommit.contextMenuOpen.fileView > -1) {
					this.expandedCommit.contextMenuOpen.fileView = -1;
					contextMenu.close();
				}
			}, () => this.saveState());

			document.getElementById('cdvFileViewTypeTree')!.addEventListener('click', () => {
				this.changeFileViewType(GG.FileViewType.Tree);
			});

			document.getElementById('cdvFileViewTypeList')!.addEventListener('click', () => {
				this.changeFileViewType(GG.FileViewType.List);
			});

			if (codeReviewPossible) {
				this.renderCodeReviewBtn();
				document.getElementById('cdvCodeReview')!.addEventListener('click', (e) => {
					const expandedCommit = this.expandedCommit;
					if (expandedCommit === null || e.target === null) return;
					let sourceElem = <HTMLElement>(<Element>e.target).closest('#cdvCodeReview')!;
					if (sourceElem.classList.contains(CLASS_ACTIVE)) {
						sendMessage({ command: 'endCodeReview', repo: this.currentRepo, id: expandedCommit.codeReview!.id });
						this.endCodeReview();
					} else {
						const commitOrder = this.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
						const id = expandedCommit.compareWithHash !== null ? commitOrder.from + '-' + commitOrder.to : expandedCommit.commitHash;
						sendMessage({
							command: 'startCodeReview',
							repo: this.currentRepo,
							id: id,
							commitHash: expandedCommit.commitHash,
							compareWithHash: expandedCommit.compareWithHash,
							files: getFilesInTree(expandedCommit.fileTree!, expandedCommit.fileChanges!),
							lastViewedFile: expandedCommit.lastViewedFile
						});
					}
				});
			}

			if (externalDiffPossible) {
				document.getElementById('cdvExternalDiff')!.addEventListener('click', () => {
					const expandedCommit = this.expandedCommit;
					if (expandedCommit === null || this.gitConfig === null || (this.gitConfig.diffTool === null && this.gitConfig.guiDiffTool === null)) return;
					const commitOrder = this.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
					runAction({
						command: 'openExternalDirDiff',
						repo: this.currentRepo,
						fromHash: commitOrder.from,
						toHash: commitOrder.to,
						isGui: this.gitConfig.guiDiffTool !== null
					}, '正在打开外部目录差异');
				});
			}
		}
	}

	private setCdvHeight(elem: HTMLElement, isDocked: boolean) {
		let height = this.gitRepos[this.currentRepo].cdvHeight, windowHeight = window.innerHeight;
		if (height > windowHeight - 40) {
			height = Math.max(windowHeight - 40, 100);
			if (height !== this.gitRepos[this.currentRepo].cdvHeight) {
				this.gitRepos[this.currentRepo].cdvHeight = height;
				this.saveRepoState();
			}
		}

		let heightPx = height + 'px';
		elem.style.height = heightPx;
		if (isDocked) this.viewElem.style.bottom = heightPx;
	}

	private setCdvDivider() {
		let percent = (this.gitRepos[this.currentRepo].cdvDivider * 100).toFixed(2) + '%';
		let summaryElem = document.getElementById('cdvSummary'), dividerElem = document.getElementById('cdvDivider'), filesElem = document.getElementById('cdvFiles');
		if (summaryElem !== null) summaryElem.style.width = percent;
		if (dividerElem !== null) dividerElem.style.left = percent;
		if (filesElem !== null) filesElem.style.left = percent;
	}

	private makeCdvResizable() {
		let prevY = -1;

		const processResizingCdvHeight: EventListener = (e) => {
			if (prevY < 0) return;
			let delta = (<MouseEvent>e).pageY - prevY, isDocked = this.isCdvDocked(), windowHeight = window.innerHeight;
			prevY = (<MouseEvent>e).pageY;
			let height = this.gitRepos[this.currentRepo].cdvHeight + (isDocked ? -delta : delta);
			if (height < 100) height = 100;
			else if (height > 600) height = 600;
			if (height > windowHeight - 40) height = Math.max(windowHeight - 40, 100);

			if (this.gitRepos[this.currentRepo].cdvHeight !== height) {
				this.gitRepos[this.currentRepo].cdvHeight = height;
				let elem = document.getElementById('cdv');
				if (elem !== null) this.setCdvHeight(elem, isDocked);
				if (!isDocked) this.renderGraph();
			}
		};
		const stopResizingCdvHeight: EventListener = (e) => {
			if (prevY < 0) return;
			processResizingCdvHeight(e);
			this.saveRepoState();
			prevY = -1;
			eventOverlay.remove();
		};

		addListenerToClass('cdvHeightResize', 'mousedown', (e) => {
			prevY = (<MouseEvent>e).pageY;
			eventOverlay.create('rowResize', processResizingCdvHeight, stopResizingCdvHeight);
		});
	}

	private makeCdvDividerDraggable() {
		let minX = -1, width = -1;

		const processDraggingCdvDivider: EventListener = (e) => {
			if (minX < 0) return;
			let percent = ((<MouseEvent>e).clientX - minX) / width;
			if (percent < 0.2) percent = 0.2;
			else if (percent > 0.8) percent = 0.8;

			if (this.gitRepos[this.currentRepo].cdvDivider !== percent) {
				this.gitRepos[this.currentRepo].cdvDivider = percent;
				this.setCdvDivider();
			}
		};
		const stopDraggingCdvDivider: EventListener = (e) => {
			if (minX < 0) return;
			processDraggingCdvDivider(e);
			this.saveRepoState();
			minX = -1;
			eventOverlay.remove();
		};

		document.getElementById('cdvDivider')!.addEventListener('mousedown', () => {
			const contentElem = document.getElementById('cdvContent');
			if (contentElem === null) return;

			const bounds = contentElem.getBoundingClientRect();
			minX = bounds.left;
			width = bounds.width;
			eventOverlay.create('colResize', processDraggingCdvDivider, stopDraggingCdvDivider);
		});
	}

	/**
	 * Updates the state of a file in the Commit Details View.
	 * @param file The file that was affected.
	 * @param fileElem The HTML Element of the file.
	 * @param isReviewed TRUE/FALSE => Set the files reviewed state accordingly, NULL => Don't update the files reviewed state.
	 * @param fileWasViewed Was the file viewed - if so, set it to be the last viewed file.
	 */
	private cdvUpdateFileState(file: GG.GitFileChange, fileElem: HTMLElement, isReviewed: boolean | null, fileWasViewed: boolean) {
		const expandedCommit = this.expandedCommit, filesElem = document.getElementById('cdvFiles'), filePath = file.newFilePath;
		if (expandedCommit === null || expandedCommit.fileTree === null || filesElem === null) return;

		if (fileWasViewed) {
			expandedCommit.lastViewedFile = filePath;
			let lastViewedElem = document.getElementById('cdvLastFileViewed');
			if (lastViewedElem !== null) lastViewedElem.remove();
			lastViewedElem = document.createElement('span');
			lastViewedElem.id = 'cdvLastFileViewed';
			lastViewedElem.title = 'Last File Viewed';
			lastViewedElem.innerHTML = SVG_ICONS.eyeOpen;
			insertBeforeFirstChildWithClass(lastViewedElem, fileElem, 'fileTreeFileAction');
		}

		if (expandedCommit.codeReview !== null) {
			if (isReviewed !== null) {
				if (isReviewed) {
					expandedCommit.codeReview.remainingFiles = expandedCommit.codeReview.remainingFiles.filter((path: string) => path !== filePath);
				} else {
					expandedCommit.codeReview.remainingFiles.push(filePath);
				}

				alterFileTreeFileReviewed(expandedCommit.fileTree, filePath, isReviewed);
				updateFileTreeHtmlFileReviewed(filesElem, expandedCommit.fileTree, filePath);
			}

			sendMessage({
				command: 'updateCodeReview',
				repo: this.currentRepo,
				id: expandedCommit.codeReview.id,
				remainingFiles: expandedCommit.codeReview.remainingFiles,
				lastViewedFile: expandedCommit.lastViewedFile
			});

			if (expandedCommit.codeReview.remainingFiles.length === 0) {
				expandedCommit.codeReview = null;
				this.renderCodeReviewBtn();
			}
		}

		this.saveState();
	}

	private isCdvDocked() {
		return this.config.commitDetailsView.location === GG.CommitDetailsViewLocation.DockedToBottom;
	}

	public isCdvOpen(commitHash: string, compareWithHash: string | null) {
		return this.expandedCommit !== null && this.expandedCommit.commitHash === commitHash && this.expandedCommit.compareWithHash === compareWithHash;
	}

	private getCommitOrder(hash1: string, hash2: string) {
		if (this.commitLookup[hash1] > this.commitLookup[hash2]) {
			return { from: hash1, to: hash2 };
		} else {
			return { from: hash2, to: hash1 };
		}
	}

	private getFileViewType() {
		return this.gitRepos[this.currentRepo].fileViewType === GG.FileViewType.Default
			? this.config.commitDetailsView.fileViewType
			: this.gitRepos[this.currentRepo].fileViewType;
	}

	private setFileViewType(type: GG.FileViewType) {
		this.gitRepos[this.currentRepo].fileViewType = type;
		this.saveRepoState();
	}

	private changeFileViewType(type: GG.FileViewType) {
		const expandedCommit = this.expandedCommit, filesElem = document.getElementById('cdvFiles');
		if (expandedCommit === null || expandedCommit.fileTree === null || expandedCommit.fileChanges === null || filesElem === null) return;
		GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
		this.setFileViewType(type);
		const commitOrder = this.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
		filesElem.innerHTML = generateFileViewHtml(expandedCommit.fileTree, expandedCommit.fileChanges, expandedCommit.lastViewedFile, expandedCommit.contextMenuOpen.fileView, type, commitOrder.to === UNCOMMITTED);
		this.makeCdvFileViewInteractive();
		this.renderCdvFileViewTypeBtns();
	}

	private makeCdvFileViewInteractive() {
		const getFileElemOfEventTarget = (target: EventTarget) => <HTMLElement>(<Element>target).closest('.fileTreeFileRecord');
		const getFileOfFileElem = (fileChanges: ReadonlyArray<GG.GitFileChange>, fileElem: HTMLElement) => fileChanges[parseInt(fileElem.dataset.index!)];

		const getCommitHashForFile = (file: GG.GitFileChange, expandedCommit: ExpandedCommit) => {
			const commit = this.commits[this.commitLookup[expandedCommit.commitHash]];
			if (expandedCommit.compareWithHash !== null) {
				return this.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash).to;
			} else if (commit.stash !== null && file.type === GG.GitFileStatus.Untracked) {
				return commit.stash.untrackedFilesHash!;
			} else {
				return expandedCommit.commitHash;
			}
		};

		const triggerViewFileDiff = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			let commit = this.commits[this.commitLookup[expandedCommit.commitHash]], fromHash: string, toHash: string, fileStatus = file.type;
			if (expandedCommit.compareWithHash !== null) {
				// Commit Comparison
				const commitOrder = this.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash);
				fromHash = commitOrder.from;
				toHash = commitOrder.to;
			} else if (commit.stash !== null) {
				// Stash Commit
				if (fileStatus === GG.GitFileStatus.Untracked) {
					fromHash = commit.stash.untrackedFilesHash!;
					toHash = commit.stash.untrackedFilesHash!;
					fileStatus = GG.GitFileStatus.Added;
				} else {
					fromHash = commit.stash.baseHash;
					toHash = expandedCommit.commitHash;
				}
			} else {
				// Single Commit
				fromHash = expandedCommit.commitHash;
				toHash = expandedCommit.commitHash;
			}

			this.cdvUpdateFileState(file, fileElem, true, true);
			sendMessage({
				command: 'viewDiff',
				repo: this.currentRepo,
				fromHash: fromHash,
				toHash: toHash,
				oldFilePath: file.oldFilePath,
				newFilePath: file.newFilePath,
				type: fileStatus
			});
		};

		const triggerCopyFilePath = (file: GG.GitFileChange, absolute: boolean) => {
			sendMessage({ command: 'copyFilePath', repo: this.currentRepo, filePath: file.newFilePath, absolute: absolute });
		};

		const triggerResetFileToRevision = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			const commitHash = getCommitHashForFile(file, expandedCommit);
			dialog.showConfirmation('你确定要复位 <b><i>' + escapeHtml(file.newFilePath) + '</i></b> 使其处于提交的状态 <b><i>' + abbrevCommit(commitHash) + '</i></b> 吗? 对该文件所做的任何未提交的更改都将被覆盖。', '是，复位文件', () => {
				runAction({ command: 'resetFileToRevision', repo: this.currentRepo, commitHash: commitHash, filePath: file.newFilePath }, '正在复位文件');
			}, {
				type: TargetType.CommitDetailsView,
				hash: commitHash,
				elem: fileElem
			});
		};

		const triggerViewFileAtRevision = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			this.cdvUpdateFileState(file, fileElem, true, true);
			sendMessage({ command: 'viewFileAtRevision', repo: this.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
		};

		const triggerViewFileDiffWithWorkingFile = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			this.cdvUpdateFileState(file, fileElem, null, true);
			sendMessage({ command: 'viewDiffWithWorkingFile', repo: this.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
		};

		const triggerOpenFile = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null) return;

			this.cdvUpdateFileState(file, fileElem, true, true);
			sendMessage({ command: 'openFile', repo: this.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
		};

		addListenerToClass('fileTreeFolder', 'click', (e) => {
			let expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileTree === null || e.target === null) return;

			let sourceElem = <HTMLElement>(<Element>e.target).closest('.fileTreeFolder');
			let parent = sourceElem.parentElement!;
			parent.classList.toggle('closed');
			let isOpen = !parent.classList.contains('closed');
			parent.children[0].children[0].innerHTML = isOpen ? SVG_ICONS.openFolder : SVG_ICONS.closedFolder;
			parent.children[1].classList.toggle('hidden');
			alterFileTreeFolderOpen(expandedCommit.fileTree, decodeURIComponent(sourceElem.dataset.folderpath!), isOpen);
			this.saveState();
		});

		addListenerToClass('fileTreeRepo', 'click', (e) => {
			if (e.target === null) return;
			this.loadRepos(this.gitRepos, null, {
				repo: decodeURIComponent((<HTMLElement>(<Element>e.target).closest('.fileTreeRepo')).dataset.path!)
			});
		});

		addListenerToClass('fileTreeFile', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const sourceElem = <HTMLElement>(<Element>e.target).closest('.fileTreeFile'), fileElem = getFileElemOfEventTarget(e.target);
			if (!sourceElem.classList.contains('gitDiffPossible')) return;
			triggerViewFileDiff(getFileOfFileElem(expandedCommit.fileChanges, fileElem), fileElem);
		});

		addListenerToClass('copyGitFile', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const fileElem = getFileElemOfEventTarget(e.target);
			triggerCopyFilePath(getFileOfFileElem(expandedCommit.fileChanges, fileElem), true);
		});

		addListenerToClass('viewGitFileAtRevision', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const fileElem = getFileElemOfEventTarget(e.target);
			triggerViewFileAtRevision(getFileOfFileElem(expandedCommit.fileChanges, fileElem), fileElem);
		});

		addListenerToClass('openGitFile', 'click', (e) => {
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

			const fileElem = getFileElemOfEventTarget(e.target);
			triggerOpenFile(getFileOfFileElem(expandedCommit.fileChanges, fileElem), fileElem);
		});

		addListenerToClass('fileTreeFileRecord', 'contextmenu', (e: Event) => {
			handledEvent(e);
			const expandedCommit = this.expandedCommit;
			if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;
			const fileElem = getFileElemOfEventTarget(e.target);
			const file = getFileOfFileElem(expandedCommit.fileChanges, fileElem);
			const commitOrder = this.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
			const isUncommitted = commitOrder.to === UNCOMMITTED;

			GitGraphView.closeCdvContextMenuIfOpen(expandedCommit);
			expandedCommit.contextMenuOpen.fileView = parseInt(fileElem.dataset.index!);

			const target: ContextMenuTarget & CommitTarget = {
				type: TargetType.CommitDetailsView,
				hash: expandedCommit.commitHash,
				index: this.commitLookup[expandedCommit.commitHash],
				elem: fileElem
			};
			const diffPossible = file.type === GG.GitFileStatus.Untracked || (file.additions !== null && file.deletions !== null);
			const fileExistsAtThisRevision = file.type !== GG.GitFileStatus.Deleted && !isUncommitted;
			const fileExistsAtThisRevisionAndDiffPossible = fileExistsAtThisRevision && diffPossible;
			const codeReviewInProgressAndNotReviewed = expandedCommit.codeReview !== null && expandedCommit.codeReview.remainingFiles.includes(file.newFilePath);
			const visibility = this.config.contextMenuActionsVisibility.commitDetailsViewFile;

			contextMenu.show([
				[
					{
						title: '查看差异',
						visible: visibility.viewDiff && diffPossible,
						onClick: () => triggerViewFileDiff(file, fileElem)
					},
					{
						title: '在此修订程序中查看文件',
						visible: visibility.viewFileAtThisRevision && fileExistsAtThisRevisionAndDiffPossible,
						onClick: () => triggerViewFileAtRevision(file, fileElem)
					},
					{
						title: '查看工作文件的差异',
						visible: visibility.viewDiffWithWorkingFile && fileExistsAtThisRevisionAndDiffPossible,
						onClick: () => triggerViewFileDiffWithWorkingFile(file, fileElem)
					},
					{
						title: '打开文件',
						visible: visibility.openFile && file.type !== GG.GitFileStatus.Deleted,
						onClick: () => triggerOpenFile(file, fileElem)
					}
				],
				[
					{
						title: '标记被审查的',
						visible: visibility.markAsReviewed && codeReviewInProgressAndNotReviewed,
						onClick: () => this.cdvUpdateFileState(file, fileElem, true, false)
					},
					{
						title: '标记未被审查的',
						visible: visibility.markAsNotReviewed && expandedCommit.codeReview !== null && !codeReviewInProgressAndNotReviewed,
						onClick: () => this.cdvUpdateFileState(file, fileElem, false, false)
					}
				],
				[
					{
						title: '复位文件到此修订' + ELLIPSIS,
						visible: visibility.resetFileToThisRevision && fileExistsAtThisRevision && expandedCommit.compareWithHash === null,
						onClick: () => triggerResetFileToRevision(file, fileElem)
					}
				],
				[
					{
						title: '复制绝对文件路径到剪贴板',
						visible: visibility.copyAbsoluteFilePath,
						onClick: () => triggerCopyFilePath(file, true)
					},
					{
						title: '复制相对文件路径到剪贴板',
						visible: visibility.copyRelativeFilePath,
						onClick: () => triggerCopyFilePath(file, false)
					}
				]
			], false, target, <MouseEvent>e, this.isCdvDocked() ? document.body : this.viewElem, () => {
				expandedCommit.contextMenuOpen.fileView = -1;
			});
		});
	}

	private renderCdvFileViewTypeBtns() {
		if (this.expandedCommit === null) return;
		let treeBtnElem = document.getElementById('cdvFileViewTypeTree'), listBtnElem = document.getElementById('cdvFileViewTypeList');
		if (treeBtnElem === null || listBtnElem === null) return;

		let listView = this.getFileViewType() === GG.FileViewType.List;
		alterClass(treeBtnElem, CLASS_ACTIVE, !listView);
		alterClass(listBtnElem, CLASS_ACTIVE, listView);
	}

	private renderCdvExternalDiffBtn() {
		if (this.expandedCommit === null) return;
		const externalDiffBtnElem = document.getElementById('cdvExternalDiff');
		if (externalDiffBtnElem === null) return;

		alterClass(externalDiffBtnElem, CLASS_ENABLED, this.gitConfig !== null && (this.gitConfig.diffTool !== null || this.gitConfig.guiDiffTool !== null));
		const toolName = this.gitConfig !== null
			? this.gitConfig.guiDiffTool !== null
				? this.gitConfig.guiDiffTool
				: this.gitConfig.diffTool
			: null;
		externalDiffBtnElem.title = '打开外部目录的差异' + (toolName !== null ? ' 用(with) "' + toolName + '"' : '');
	}

	private static closeCdvContextMenuIfOpen(expandedCommit: ExpandedCommit) {
		if (expandedCommit.contextMenuOpen.summary || expandedCommit.contextMenuOpen.fileView > -1) {
			expandedCommit.contextMenuOpen.summary = false;
			expandedCommit.contextMenuOpen.fileView = -1;
			contextMenu.close();
		}
	}


	/* Code Review */

	public startCodeReview(commitHash: string, compareWithHash: string | null, codeReview: GG.CodeReview) {
		if (this.expandedCommit === null || this.expandedCommit.commitHash !== commitHash || this.expandedCommit.compareWithHash !== compareWithHash) return;
		this.saveAndRenderCodeReview(codeReview);
	}

	public endCodeReview() {
		if (this.expandedCommit === null || this.expandedCommit.codeReview === null) return;
		this.saveAndRenderCodeReview(null);
	}

	private saveAndRenderCodeReview(codeReview: GG.CodeReview | null) {
		let filesElem = document.getElementById('cdvFiles');
		if (this.expandedCommit === null || this.expandedCommit.fileTree === null || filesElem === null) return;

		this.expandedCommit.codeReview = codeReview;
		setFileTreeReviewed(this.expandedCommit.fileTree, codeReview === null);
		this.saveState();
		this.renderCodeReviewBtn();
		updateFileTreeHtml(filesElem, this.expandedCommit.fileTree);
	}

	private renderCodeReviewBtn() {
		if (this.expandedCommit === null) return;
		let btnElem = document.getElementById('cdvCodeReview');
		if (btnElem === null) return;

		let active = this.expandedCommit.codeReview !== null;
		alterClass(btnElem, CLASS_ACTIVE, active);
		btnElem.title = (active ? '结束' : '开始') + ' 代码评审';
	}
}


/* Main */

const contextMenu = new ContextMenu(), dialog = new Dialog(), eventOverlay = new EventOverlay();
let loaded = false;

window.addEventListener('load', () => {
	if (loaded) return;
	loaded = true;

	TextFormatter.registerCustomEmojiMappings(initialState.config.customEmojiShortcodeMappings);

	const viewElem = document.getElementById('view');
	if (viewElem === null) return;

	const gitGraph = new GitGraphView(viewElem, VSCODE_API.getState());
	const imageResizer = new ImageResizer();

	/* Command Processing */
	window.addEventListener('message', event => {
		const msg: GG.ResponseMessage = event.data;
		switch (msg.command) {
			case 'addRemote':
				refreshOrDisplayError(msg.error, '无法添加远程仓库分支', true);
				break;
			case 'addTag':
				if (msg.pushToRemote !== null && msg.errors.length === 2 && msg.errors[0] === null && isExtensionErrorInfo(msg.errors[1], GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote)) {
					gitGraph.refresh(false);
					handleResponsePushTagCommitNotOnRemote(msg.repo, msg.tagName, [msg.pushToRemote], msg.commitHash, msg.errors[1]!);
				} else {
					refreshAndDisplayErrors(msg.errors, '无法添加标签');
				}
				break;
			case 'applyStash':
				refreshOrDisplayError(msg.error, '无法恢复暂存状态');
				break;
			case 'branchFromStash':
				refreshOrDisplayError(msg.error, '无法从暂存区创建分支');
				break;
			case 'checkoutBranch':
				refreshAndDisplayErrors(msg.errors, '无法切换分支' + (msg.pullAfterwards !== null ? ' & 改变拉取' : ''));
				break;
			case 'checkoutCommit':
				refreshOrDisplayError(msg.error, '无法切换提交');
				break;
			case 'cherrypickCommit':
				refreshAndDisplayErrors(msg.errors, '无法Cherry Pick(选择提交)');
				break;
			case 'cleanUntrackedFiles':
				refreshOrDisplayError(msg.error, '无法清理未跟踪的文件');
				break;
			case 'commitDetails':
				if (msg.commitDetails !== null) {
					gitGraph.showCommitDetails(msg.commitDetails, gitGraph.createFileTree(msg.commitDetails.fileChanges, msg.codeReview), msg.avatar, msg.codeReview, msg.codeReview !== null ? msg.codeReview.lastViewedFile : null, msg.refresh);
				} else {
					gitGraph.closeCommitDetails(true);
					dialog.showError('无法加载提交详情', msg.error, null, null);
				}
				break;
			case 'compareCommits':
				if (msg.error === null) {
					gitGraph.showCommitComparison(msg.commitHash, msg.compareWithHash, msg.fileChanges, gitGraph.createFileTree(msg.fileChanges, msg.codeReview), msg.codeReview, msg.codeReview !== null ? msg.codeReview.lastViewedFile : null, msg.refresh);
				} else {
					gitGraph.closeCommitComparison(true);
					dialog.showError('无法加载提交比较', msg.error, null, null);
				}
				break;
			case 'copyFilePath':
				finishOrDisplayError(msg.error, '无法复制文件路径到剪贴板');
				break;
			case 'copyToClipboard':
				finishOrDisplayError(msg.error, '无法复制 ' + msg.type + ' 剪切板');
				break;
			case 'createArchive':
				finishOrDisplayError(msg.error, '无法创建存档', true);
				break;
			case 'createBranch':
				refreshAndDisplayErrors(msg.errors, '无法创建分支');
				break;
			case 'createPullRequest':
				finishOrDisplayErrors(msg.errors, '无法创建拉取请求', () => {
					if (msg.push) {
						gitGraph.refresh(false);
					}
				}, true);
				break;
			case 'deleteBranch':
				handleResponseDeleteBranch(msg);
				break;
			case 'deleteRemote':
				refreshOrDisplayError(msg.error, '无法删除远程仓库', true);
				break;
			case 'deleteRemoteBranch':
				refreshOrDisplayError(msg.error, '无法删除远程仓库分支');
				break;
			case 'deleteTag':
				refreshOrDisplayError(msg.error, '无法删除标签');
				break;
			case 'deleteUserDetails':
				finishOrDisplayErrors(msg.errors, '无法删除Git用户详细信息', () => gitGraph.requestLoadConfig(), true);
				break;
			case 'dropCommit':
				refreshOrDisplayError(msg.error, '无法删除提交');
				break;
			case 'dropStash':
				refreshOrDisplayError(msg.error, '无法删除暂存状态');
				break;
			case 'editRemote':
				refreshOrDisplayError(msg.error, '无法将更改保存到远程仓库', true);
				break;
			case 'editUserDetails':
				finishOrDisplayErrors(msg.errors, '无法保存Git用户详情', () => gitGraph.requestLoadConfig(), true);
				break;
			case 'exportRepoConfig':
				refreshOrDisplayError(msg.error, '无法导出仓库配置');
				break;
			case 'fetch':
				refreshOrDisplayError(msg.error, '无法从远处获取');
				break;
			case 'fetchAvatar':
				imageResizer.resize(msg.image, (resizedImage) => {
					gitGraph.loadAvatar(msg.email, resizedImage);
				});
				break;
			case 'fetchIntoLocalBranch':
				refreshOrDisplayError(msg.error, '无法获取到本地分支');
				break;
			case 'loadCommits':
				gitGraph.processLoadCommitsResponse(msg);
				break;
			case 'loadConfig':
				gitGraph.processLoadConfig(msg);
				break;
			case 'loadRepoInfo':
				gitGraph.processLoadRepoInfoResponse(msg);
				break;
			case 'loadRepos':
				gitGraph.loadRepos(msg.repos, msg.lastActiveRepo, msg.loadViewTo);
				break;
			case 'merge':
				refreshOrDisplayError(msg.error, '无法合并 ' + msg.actionOn);
				break;
			case 'openExtensionSettings':
				finishOrDisplayError(msg.error, '无法打开扩展设置');
				break;
			case 'openExternalDirDiff':
				finishOrDisplayError(msg.error, '无法打开外部目录差异', true);
				break;
			case 'openExternalUrl':
				finishOrDisplayError(msg.error, '无法打开外部URL');
				break;
			case 'openFile':
				finishOrDisplayError(msg.error, '无法打开文件');
				break;
			case 'openTerminal':
				finishOrDisplayError(msg.error, '无法打开终端', true);
				break;
			case 'popStash':
				refreshOrDisplayError(msg.error, '无法(恢复并删除暂存状态)');
				break;
			case 'pruneRemote':
				refreshOrDisplayError(msg.error, '无法剪除远程仓库');
				break;
			case 'pullBranch':
				refreshOrDisplayError(msg.error, '无法拉取分支');
				break;
			case 'pushBranch':
				refreshAndDisplayErrors(msg.errors, '无法推送分支', msg.willUpdateBranchConfig);
				break;
			case 'pushStash':
				refreshOrDisplayError(msg.error, '无法暂存未提交的更改');
				break;
			case 'pushTag':
				if (msg.errors.length === 1 && isExtensionErrorInfo(msg.errors[0], GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote)) {
					handleResponsePushTagCommitNotOnRemote(msg.repo, msg.tagName, msg.remotes, msg.commitHash, msg.errors[0]!);
				} else {
					refreshAndDisplayErrors(msg.errors, '无法推送标签');
				}
				break;
			case 'rebase':
				if (msg.error === null) {
					if (msg.interactive) {
						dialog.closeActionRunning();
					} else {
						gitGraph.refresh(false);
					}
				} else {
					dialog.showError('无法在 ' + msg.actionOn, +'Rebase(复位)当前分支' + msg.error, null, null);
				}
				break;
			case 'refresh':
				gitGraph.refresh(false);
				break;
			case 'renameBranch':
				refreshOrDisplayError(msg.error, '无法重命名分支');
				break;
			case 'resetFileToRevision':
				refreshOrDisplayError(msg.error, '无法复位文件大修订版本');
				break;
			case 'resetToCommit':
				refreshOrDisplayError(msg.error, '无法复位到提交');
				break;
			case 'revertCommit':
				refreshOrDisplayError(msg.error, '无法回撤到提交');
				break;
			case 'setGlobalViewState':
				finishOrDisplayError(msg.error, '无法保存全局视图状态');
				break;
			case 'setWorkspaceViewState':
				finishOrDisplayError(msg.error, '无法保存工作区视图状态');
				break;
			case 'startCodeReview':
				if (msg.error === null) {
					gitGraph.startCodeReview(msg.commitHash, msg.compareWithHash, msg.codeReview);
				} else {
					dialog.showError('无法开始代码评审', msg.error, null, null);
				}
				break;
			case 'tagDetails':
				if (msg.details !== null) {
					gitGraph.renderTagDetails(msg.tagName, msg.commitHash, msg.details);
				} else {
					dialog.showError('无法找回标签详情', msg.error, null, null);
				}
				break;
			case 'updateCodeReview':
				if (msg.error !== null) {
					dialog.showError('无法更新代码评审', msg.error, null, null);
				}
				break;
			case 'viewDiff':
				finishOrDisplayError(msg.error, '无法查看差异');
				break;
			case 'viewDiffWithWorkingFile':
				finishOrDisplayError(msg.error, '无法查看工作文件的差异');
				break;
			case 'viewFileAtRevision':
				finishOrDisplayError(msg.error, '无法此修订程序中查看文件');
				break;
			case 'viewScm':
				finishOrDisplayError(msg.error, '无法打开开源控件视图');
				break;
		}
	});

	function handleResponseDeleteBranch(msg: GG.ResponseDeleteBranch) {
		if (msg.errors.length > 0 && msg.errors[0] !== null && msg.errors[0].includes('git branch -D')) {
			dialog.showConfirmation('分支 <b><i>' + escapeHtml(msg.branchName) + '</i></b> 没有被完全合并。你要强制删除它吗?', '是的，强制删除分支', () => {
				runAction({ command: 'deleteBranch', repo: msg.repo, branchName: msg.branchName, forceDelete: true, deleteOnRemotes: msg.deleteOnRemotes }, '正在删除分支');
			}, { type: TargetType.Repo });
		} else {
			refreshAndDisplayErrors(msg.errors, '无法删除分支');
		}
	}

	function handleResponsePushTagCommitNotOnRemote(repo: string, tagName: string, remotes: string[], commitHash: string, error: string) {
		const remotesNotContainingCommit: string[] = parseExtensionErrorInfo(error, GG.ErrorInfoExtensionPrefix.PushTagCommitNotOnRemote);

		const html = '<span class="dialogAlert">' + SVG_ICONS.alert + '警告:不是在远程分支上提交' + (remotesNotContainingCommit.length > 1 ? 's ' : ' ') + '</span><br>' +
			'<span class="messageContent">' +
			'<p style="margin:0 0 6px 0;">标签 <b><i>' + escapeHtml(tagName) + '</i></b> 是否在不属于远程仓库任何一个已知分支的提交上' + (remotesNotContainingCommit.length > 1 ? 's' : '') + ' ' + formatCommaSeparatedList(remotesNotContainingCommit.map((remote) => '<b><i>' + escapeHtml(remote) + '</i></b>')) + '.</p>' +
			'<p style="margin:0;">你要继续将标签推到远程吗' + (remotes.length > 1 ? 's' : '') + ' ' + formatCommaSeparatedList(remotes.map((remote) => '<b><i>' + escapeHtml(remote) + '</i></b>')) + ' 不管怎样?</p>' +
			'</span>';

		dialog.showForm(html, [{ type: DialogInputType.Checkbox, name: '总是继续', value: false }], '继续推送', (values) => {
			if (<boolean>values[0]) {
				updateGlobalViewState('pushTagSkipRemoteCheck', true);
			}
			runAction({
				command: 'pushTag',
				repo: repo,
				tagName: tagName,
				remotes: remotes,
				commitHash: commitHash,
				skipRemoteCheck: true
			}, '标签推送中');
		}, { type: TargetType.Repo }, '取消', null, true);
	}

	function refreshOrDisplayError(error: GG.ErrorInfo, errorMessage: string, configChanges: boolean = false) {
		if (error === null) {
			gitGraph.refresh(false, configChanges);
		} else {
			dialog.showError(errorMessage, error, null, null);
		}
	}

	function refreshAndDisplayErrors(errors: GG.ErrorInfo[], errorMessage: string, configChanges: boolean = false) {
		const reducedErrors = reduceErrorInfos(errors);
		if (reducedErrors.error !== null) {
			dialog.showError(errorMessage, reducedErrors.error, null, null);
		}
		if (reducedErrors.partialOrCompleteSuccess) {
			gitGraph.refresh(false, configChanges);
		} else if (configChanges) {
			gitGraph.requestLoadConfig();
		}
	}

	function finishOrDisplayError(error: GG.ErrorInfo, errorMessage: string, dismissActionRunning: boolean = false) {
		if (error !== null) {
			dialog.showError(errorMessage, error, null, null);
		} else if (dismissActionRunning) {
			dialog.closeActionRunning();
		}
	}

	function finishOrDisplayErrors(errors: GG.ErrorInfo[], errorMessage: string, partialOrCompleteSuccessCallback: () => void, dismissActionRunning: boolean = false) {
		const reducedErrors = reduceErrorInfos(errors);
		finishOrDisplayError(reducedErrors.error, errorMessage, dismissActionRunning);
		if (reducedErrors.partialOrCompleteSuccess) {
			partialOrCompleteSuccessCallback();
		}
	}

	function reduceErrorInfos(errors: GG.ErrorInfo[]) {
		let error: GG.ErrorInfo = null, partialOrCompleteSuccess = false;
		for (let i = 0; i < errors.length; i++) {
			if (errors[i] !== null) {
				error = error !== null ? error + '\n\n' + errors[i] : errors[i];
			} else {
				partialOrCompleteSuccess = true;
			}
		}

		return {
			error: error,
			partialOrCompleteSuccess: partialOrCompleteSuccess
		};
	}

	/**
	 * Checks whether the given ErrorInfo has an ErrorInfoExtensionPrefix.
	 * @param error The ErrorInfo to check.
	 * @param prefix The ErrorInfoExtensionPrefix to test.
	 * @returns TRUE => ErrorInfo has the ErrorInfoExtensionPrefix, FALSE => ErrorInfo doesn\'t have the ErrorInfoExtensionPrefix
	 */
	function isExtensionErrorInfo(error: GG.ErrorInfo, prefix: GG.ErrorInfoExtensionPrefix) {
		return error !== null && error.startsWith(prefix);
	}

	/**
	 * Parses the JSON data from an ErrorInfo prefixed by the provided ErrorInfoExtensionPrefix.
	 * @param error The ErrorInfo to parse.
	 * @param prefix The ErrorInfoExtensionPrefix used by `error`.
	 * @returns The parsed JSON data.
	 */
	function parseExtensionErrorInfo(error: string, prefix: GG.ErrorInfoExtensionPrefix) {
		return JSON.parse(error.substring(prefix.length));
	}
});


/* File Tree Methods (for the Commit Details & Comparison Views) */

function generateFileViewHtml(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, type: GG.FileViewType, isUncommitted: boolean) {
	return type === GG.FileViewType.List
		? generateFileListHtml(folder, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted)
		: generateFileTreeHtml(folder, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted, true);
}

function generateFileTreeHtml(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, isUncommitted: boolean, topLevelFolder: boolean): string {
	const curFolderInfo = topLevelFolder || !initialState.config.commitDetailsView.fileTreeCompactFolders
		? { folder: folder, name: folder.name, pathSeg: folder.name }
		: getCurrentFolderInfo(folder, folder.name, folder.name);

	const children = sortFolderKeys(curFolderInfo.folder).map((key) => {
		const cur = curFolderInfo.folder.contents[key];
		return cur.type === 'folder'
			? generateFileTreeHtml(cur, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted, false)
			: generateFileTreeLeafHtml(cur.name, cur, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted);
	});

	return (topLevelFolder ? '' : '<li' + (curFolderInfo.folder.open ? '' : ' class="closed"') + ' data-pathseg="' + encodeURIComponent(curFolderInfo.pathSeg) + '"><span class="fileTreeFolder' + (curFolderInfo.folder.reviewed ? '' : ' pendingReview') + '" title="./' + escapeHtml(curFolderInfo.folder.folderPath) + '" data-folderpath="' + encodeURIComponent(curFolderInfo.folder.folderPath) + '"><span class="fileTreeFolderIcon">' + (curFolderInfo.folder.open ? SVG_ICONS.openFolder : SVG_ICONS.closedFolder) + '</span><span class="gitFolderName">' + escapeHtml(curFolderInfo.name) + '</span></span>') +
		'<ul class="fileTreeFolderContents' + (curFolderInfo.folder.open ? '' : ' hidden') + '">' + children.join('') + '</ul>' +
		(topLevelFolder ? '' : '</li>');
}

function getCurrentFolderInfo(folder: FileTreeFolder, name: string, pathSeg: string): { folder: FileTreeFolder, name: string, pathSeg: string } {
	const keys = Object.keys(folder.contents);
	let child: FileTreeNode;
	return keys.length === 1 && (child = folder.contents[keys[0]]).type === 'folder'
		? getCurrentFolderInfo(<FileTreeFolder>child, name + ' / ' + child.name, pathSeg + '/' + child.name)
		: { folder: folder, name: name, pathSeg: pathSeg };
}

function generateFileListHtml(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, isUncommitted: boolean) {
	const sortLeaves = (folder: FileTreeFolder, folderPath: string) => {
		let keys = sortFolderKeys(folder);
		let items: { relPath: string, leaf: FileTreeLeaf }[] = [];
		for (let i = 0; i < keys.length; i++) {
			let cur = folder.contents[keys[i]];
			let relPath = (folderPath !== '' ? folderPath + '/' : '') + cur.name;
			if (cur.type === 'folder') {
				items = items.concat(sortLeaves(cur, relPath));
			} else {
				items.push({ relPath: relPath, leaf: cur });
			}
		}
		return items;
	};
	let sortedLeaves = sortLeaves(folder, '');
	let html = '';
	for (let i = 0; i < sortedLeaves.length; i++) {
		html += generateFileTreeLeafHtml(sortedLeaves[i].relPath, sortedLeaves[i].leaf, gitFiles, lastViewedFile, fileContextMenuOpen, isUncommitted);
	}
	return '<ul class="fileTreeFolderContents">' + html + '</ul>';
}

function generateFileTreeLeafHtml(name: string, leaf: FileTreeLeaf, gitFiles: ReadonlyArray<GG.GitFileChange>, lastViewedFile: string | null, fileContextMenuOpen: number, isUncommitted: boolean) {
	let encodedName = encodeURIComponent(name), escapedName = escapeHtml(name);
	if (leaf.type === 'file') {
		const fileTreeFile = gitFiles[leaf.index];
		const textFile = fileTreeFile.additions !== null && fileTreeFile.deletions !== null;
		const diffPossible = fileTreeFile.type === GG.GitFileStatus.Untracked || textFile;
		const changeTypeMessage = GIT_FILE_CHANGE_TYPES[fileTreeFile.type] + (fileTreeFile.type === GG.GitFileStatus.Renamed ? ' (' + escapeHtml(fileTreeFile.oldFilePath) + ' → ' + escapeHtml(fileTreeFile.newFilePath) + ')' : '');
		return '<li data-pathseg="' + encodedName + '"><span class="fileTreeFileRecord' + (leaf.index === fileContextMenuOpen ? ' ' + CLASS_CONTEXT_MENU_ACTIVE : '') + '" data-index="' + leaf.index + '"><span class="fileTreeFile' + (diffPossible ? ' gitDiffPossible' : '') + (leaf.reviewed ? '' : ' ' + CLASS_PENDING_REVIEW) + '" title="' + (diffPossible ? '点击查看Diff' : '无法查看Diff' + (fileTreeFile.type !== GG.GitFileStatus.Deleted ? ' (this is a binary file)' : '')) + ' • ' + changeTypeMessage + '"><span class="fileTreeFileIcon">' + SVG_ICONS.file + '</span><span class="gitFileName ' + fileTreeFile.type + '">' + escapedName + '</span></span>' +
			(initialState.config.enhancedAccessibility ? '<span class="fileTreeFileType" title="' + changeTypeMessage + '">' + fileTreeFile.type + '</span>' : '') +
			(fileTreeFile.type !== GG.GitFileStatus.Added && fileTreeFile.type !== GG.GitFileStatus.Untracked && fileTreeFile.type !== GG.GitFileStatus.Deleted && textFile ? '<span class="fileTreeFileAddDel">(<span class="fileTreeFileAdd" title="' + fileTreeFile.additions + ' addition' + (fileTreeFile.additions !== 1 ? 's' : '') + '">+' + fileTreeFile.additions + '</span>|<span class="fileTreeFileDel" title="' + fileTreeFile.deletions + ' deletion' + (fileTreeFile.deletions !== 1 ? 's' : '') + '">-' + fileTreeFile.deletions + '</span>)</span>' : '') +
			(fileTreeFile.newFilePath === lastViewedFile ? '<span id="cdvLastFileViewed" title="查看最后一个文件">' + SVG_ICONS.eyeOpen + '</span>' : '') +
			'<span class="copyGitFile fileTreeFileAction" title="复制绝对文件路径到剪贴板">' + SVG_ICONS.copy + '</span>' +
			(fileTreeFile.type !== GG.GitFileStatus.Deleted
				? (diffPossible && !isUncommitted ? '<span class="viewGitFileAtRevision fileTreeFileAction" title="查看此修订版的文件">' + SVG_ICONS.commit + '</span>' : '') +
				'<span class="openGitFile fileTreeFileAction" title="打开文件">' + SVG_ICONS.openFile + '</span>'
				: ''
			) + '</span></li>';
	} else {
		return '<li data-pathseg="' + encodedName + '"><span class="fileTreeRepo" data-path="' + encodeURIComponent(leaf.path) + '" title="点击查看仓库"><span class="fileTreeRepoIcon">' + SVG_ICONS.closedFolder + '</span>' + escapedName + '</span></li>';
	}
}

function alterFileTreeFolderOpen(folder: FileTreeFolder, folderPath: string, open: boolean) {
	let path = folderPath.split('/'), i, cur = folder;
	for (i = 0; i < path.length; i++) {
		if (typeof cur.contents[path[i]] !== 'undefined') {
			cur = <FileTreeFolder>cur.contents[path[i]];
			if (i === path.length - 1) cur.open = open;
		} else {
			return;
		}
	}
}

function alterFileTreeFileReviewed(folder: FileTreeFolder, filePath: string, reviewed: boolean) {
	let path = filePath.split('/'), i, cur = folder, folders = [folder];
	for (i = 0; i < path.length; i++) {
		if (typeof cur.contents[path[i]] !== 'undefined') {
			if (i < path.length - 1) {
				cur = <FileTreeFolder>cur.contents[path[i]];
				folders.push(cur);
			} else {
				(<FileTreeFile>cur.contents[path[i]]).reviewed = reviewed;
			}
		} else {
			break;
		}
	}

	// Recalculate whether each of the folders leading to the file are now reviewed (deepest first).
	for (i = folders.length - 1; i >= 0; i--) {
		let keys = Object.keys(folders[i].contents), entireFolderReviewed = true;
		for (let j = 0; j < keys.length; j++) {
			let cur = folders[i].contents[keys[j]];
			if ((cur.type === 'folder' || cur.type === 'file') && !cur.reviewed) {
				entireFolderReviewed = false;
				break;
			}
		}
		folders[i].reviewed = entireFolderReviewed;
	}
}

function setFileTreeReviewed(folder: FileTreeFolder, reviewed: boolean) {
	folder.reviewed = reviewed;
	let keys = Object.keys(folder.contents);
	for (let i = 0; i < keys.length; i++) {
		let cur = folder.contents[keys[i]];
		if (cur.type === 'folder') {
			setFileTreeReviewed(cur, reviewed);
		} else if (cur.type === 'file') {
			cur.reviewed = reviewed;
		}
	}
}

function calcFileTreeFoldersReviewed(folder: FileTreeFolder) {
	const calc = (folder: FileTreeFolder) => {
		let reviewed = true;
		let keys = Object.keys(folder.contents);
		for (let i = 0; i < keys.length; i++) {
			let cur = folder.contents[keys[i]];
			if ((cur.type === 'folder' && !calc(cur)) || (cur.type === 'file' && !cur.reviewed)) reviewed = false;
		}
		folder.reviewed = reviewed;
		return reviewed;
	};
	calc(folder);
}

function updateFileTreeHtml(elem: HTMLElement, folder: FileTreeFolder) {
	let ul = getChildUl(elem);
	if (ul === null) return;

	for (let i = 0; i < ul.children.length; i++) {
		let li = <HTMLLIElement>ul.children[i];
		let pathSeg = decodeURIComponent(li.dataset.pathseg!);
		let child = getChildByPathSegment(folder, pathSeg);
		if (child.type === 'folder') {
			alterClass(<HTMLSpanElement>li.children[0], CLASS_PENDING_REVIEW, !child.reviewed);
			updateFileTreeHtml(li, child);
		} else if (child.type === 'file') {
			alterClass(<HTMLSpanElement>li.children[0].children[0], CLASS_PENDING_REVIEW, !child.reviewed);
		}
	}
}

function updateFileTreeHtmlFileReviewed(elem: HTMLElement, folder: FileTreeFolder, filePath: string) {
	let path = filePath;
	const update = (elem: HTMLElement, folder: FileTreeFolder) => {
		let ul = getChildUl(elem);
		if (ul === null) return;

		for (let i = 0; i < ul.children.length; i++) {
			let li = <HTMLLIElement>ul.children[i];
			let pathSeg = decodeURIComponent(li.dataset.pathseg!);
			if (path === pathSeg || path.startsWith(pathSeg + '/')) {
				let child = getChildByPathSegment(folder, pathSeg);
				if (child.type === 'folder') {
					alterClass(<HTMLSpanElement>li.children[0], CLASS_PENDING_REVIEW, !child.reviewed);
					path = path.substring(pathSeg.length + 1);
					update(li, child);
				} else if (child.type === 'file') {
					alterClass(<HTMLSpanElement>li.children[0].children[0], CLASS_PENDING_REVIEW, !child.reviewed);
				}
				break;
			}
		}
	};
	update(elem, folder);
}

function getFilesInTree(folder: FileTreeFolder, gitFiles: ReadonlyArray<GG.GitFileChange>) {
	let files: string[] = [];
	const scanFolder = (folder: FileTreeFolder) => {
		let keys = Object.keys(folder.contents);
		for (let i = 0; i < keys.length; i++) {
			let cur = folder.contents[keys[i]];
			if (cur.type === 'folder') {
				scanFolder(cur);
			} else if (cur.type === 'file') {
				files.push(gitFiles[cur.index].newFilePath);
			}
		}
	};
	scanFolder(folder);
	return files;
}

function sortFolderKeys(folder: FileTreeFolder) {
	let keys = Object.keys(folder.contents);
	keys.sort((a, b) => folder.contents[a].type !== 'file' && folder.contents[b].type === 'file' ? -1 : folder.contents[a].type === 'file' && folder.contents[b].type !== 'file' ? 1 : folder.contents[a].name.localeCompare(folder.contents[b].name));
	return keys;
}

function getChildByPathSegment(folder: FileTreeFolder, pathSeg: string) {
	let cur: FileTreeNode = folder, comps = pathSeg.split('/');
	for (let i = 0; i < comps.length; i++) {
		cur = (<FileTreeFolder>cur).contents[comps[i]];
	}
	return cur;
}


/* Repository State Helpers */

function getCommitOrdering(repoValue: GG.RepoCommitOrdering): GG.CommitOrdering {
	switch (repoValue) {
		case GG.RepoCommitOrdering.Default:
			return initialState.config.commitOrdering;
		case GG.RepoCommitOrdering.Date:
			return GG.CommitOrdering.Date;
		case GG.RepoCommitOrdering.AuthorDate:
			return GG.CommitOrdering.AuthorDate;
		case GG.RepoCommitOrdering.Topological:
			return GG.CommitOrdering.Topological;
	}
}

function getShowRemoteBranches(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.showRemoteBranches
		: repoValue === GG.BooleanOverride.Enabled;
}

function getShowStashes(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.showStashes
		: repoValue === GG.BooleanOverride.Enabled;
}

function getShowTags(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.showTags
		: repoValue === GG.BooleanOverride.Enabled;
}

function getIncludeCommitsMentionedByReflogs(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.includeCommitsMentionedByReflogs
		: repoValue === GG.BooleanOverride.Enabled;
}

function getOnlyFollowFirstParent(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.onlyFollowFirstParent
		: repoValue === GG.BooleanOverride.Enabled;
}

function getOnRepoLoadShowCheckedOutBranch(repoValue: GG.BooleanOverride) {
	return repoValue === GG.BooleanOverride.Default
		? initialState.config.onRepoLoad.showCheckedOutBranch
		: repoValue === GG.BooleanOverride.Enabled;
}

function getOnRepoLoadShowSpecificBranches(repoValue: string[] | null) {
	return repoValue === null
		? initialState.config.onRepoLoad.showSpecificBranches
		: repoValue;
}


/* Miscellaneous Helper Methods */

function haveFilesChanged(oldFiles: ReadonlyArray<GG.GitFileChange> | null, newFiles: ReadonlyArray<GG.GitFileChange> | null) {
	if ((oldFiles === null) !== (newFiles === null)) {
		return true;
	} else if (oldFiles === null && newFiles === null) {
		return false;
	} else {
		return !arraysEqual(oldFiles!, newFiles!, (a, b) => a.additions === b.additions && a.deletions === b.deletions && a.newFilePath === b.newFilePath && a.oldFilePath === b.oldFilePath && a.type === b.type);
	}
}

function abbrevCommit(commitHash: string) {
	return commitHash.substring(0, 8);
}

function getRepoDropdownOptions(repos: Readonly<GG.GitRepoSet>) {
	const repoPaths = getSortedRepositoryPaths(repos, initialState.config.repoDropdownOrder);
	const paths: string[] = [], names: string[] = [], distinctNames: string[] = [], firstSep: number[] = [];
	const resolveAmbiguous = (indexes: number[]) => {
		// Find ambiguous names within indexes
		let firstOccurrence: { [name: string]: number } = {}, ambiguous: { [name: string]: number[] } = {};
		for (let i = 0; i < indexes.length; i++) {
			let name = distinctNames[indexes[i]];
			if (typeof firstOccurrence[name] === 'number') {
				// name is ambiguous
				if (typeof ambiguous[name] === 'undefined') {
					// initialise ambiguous array with the first occurrence
					ambiguous[name] = [firstOccurrence[name]];
				}
				ambiguous[name].push(indexes[i]); // append current ambiguous index
			} else {
				firstOccurrence[name] = indexes[i]; // set the first occurrence of the name
			}
		}

		let ambiguousNames = Object.keys(ambiguous);
		for (let i = 0; i < ambiguousNames.length; i++) {
			// For each ambiguous name, resolve the ambiguous indexes
			let ambiguousIndexes = ambiguous[ambiguousNames[i]], retestIndexes = [];
			for (let j = 0; j < ambiguousIndexes.length; j++) {
				let ambiguousIndex = ambiguousIndexes[j];
				let nextSep = paths[ambiguousIndex].lastIndexOf('/', paths[ambiguousIndex].length - distinctNames[ambiguousIndex].length - 2);
				if (firstSep[ambiguousIndex] < nextSep) {
					// prepend the addition path and retest
					distinctNames[ambiguousIndex] = paths[ambiguousIndex].substring(nextSep + 1);
					retestIndexes.push(ambiguousIndex);
				} else {
					distinctNames[ambiguousIndex] = paths[ambiguousIndex];
				}
			}
			if (retestIndexes.length > 1) {
				// If there are 2 or more indexes that may be ambiguous
				resolveAmbiguous(retestIndexes);
			}
		}
	};

	// Initialise recursion
	const indexes = [];
	for (let i = 0; i < repoPaths.length; i++) {
		firstSep.push(repoPaths[i].indexOf('/'));
		const repo = repos[repoPaths[i]];
		if (repo.name) {
			// A name has been set for the repository
			paths.push(repoPaths[i]);
			names.push(repo.name);
			distinctNames.push(repo.name);
		} else if (firstSep[i] === repoPaths[i].length - 1 || firstSep[i] === -1) {
			// Path has no slashes, or a single trailing slash ==> use the path as the name
			paths.push(repoPaths[i]);
			names.push(repoPaths[i]);
			distinctNames.push(repoPaths[i]);
		} else {
			paths.push(repoPaths[i].endsWith('/') ? repoPaths[i].substring(0, repoPaths[i].length - 1) : repoPaths[i]); // Remove trailing slash if it exists
			let name = paths[i].substring(paths[i].lastIndexOf('/') + 1);
			names.push(name);
			distinctNames.push(name);
			indexes.push(i);
		}
	}
	resolveAmbiguous(indexes);

	const options: DropdownOption[] = [];
	for (let i = 0; i < repoPaths.length; i++) {
		let hint;
		if (names[i] === distinctNames[i]) {
			// Name is distinct, no hint needed
			hint = '';
		} else {
			// Hint path is the prefix of the distinctName before the common suffix with name
			let hintPath = distinctNames[i].substring(0, distinctNames[i].length - names[i].length - 1);

			// Keep two informative directories
			let hintComps = hintPath.split('/');
			let keepDirs = hintComps[0] !== '' ? 2 : 3;
			if (hintComps.length > keepDirs) hintComps.splice(keepDirs, hintComps.length - keepDirs, '...');

			// Construct the hint
			hint = (distinctNames[i] !== paths[i] ? '.../' : '') + hintComps.join('/');
		}
		options.push({ name: names[i], value: repoPaths[i], hint: hint });
	}
	return options;
}

function runAction(msg: GG.RequestMessage, action: string) {
	dialog.showActionRunning(action);
	sendMessage(msg);
}

function getBranchLabels(heads: ReadonlyArray<string>, remotes: ReadonlyArray<GG.GitCommitRemote>) {
	let headLabels: { name: string; remotes: string[] }[] = [], headLookup: { [name: string]: number } = {}, remoteLabels: ReadonlyArray<GG.GitCommitRemote>;
	for (let i = 0; i < heads.length; i++) {
		headLabels.push({ name: heads[i], remotes: [] });
		headLookup[heads[i]] = i;
	}
	if (initialState.config.referenceLabels.combineLocalAndRemoteBranchLabels) {
		let remainingRemoteLabels = [];
		for (let i = 0; i < remotes.length; i++) {
			if (remotes[i].remote !== null) { // If the remote of the remote branch ref is known
				let branchName = remotes[i].name.substring(remotes[i].remote!.length + 1);
				if (typeof headLookup[branchName] === 'number') {
					headLabels[headLookup[branchName]].remotes.push(remotes[i].remote!);
					continue;
				}
			}
			remainingRemoteLabels.push(remotes[i]);
		}
		remoteLabels = remainingRemoteLabels;
	} else {
		remoteLabels = remotes;
	}
	return { heads: headLabels, remotes: remoteLabels };
}

function findCommitElemWithId(elems: HTMLCollectionOf<HTMLElement>, id: number | null) {
	if (id === null) return null;
	let findIdStr = id.toString();
	for (let i = 0; i < elems.length; i++) {
		if (findIdStr === elems[i].dataset.id) return elems[i];
	}
	return null;
}

function generateSignatureHtml(signature: GG.GitSignature) {
	return '<span class="signatureInfo ' + signature.status + '" title="' + GIT_SIGNATURE_STATUS_DESCRIPTIONS[signature.status] + ':'
		+ ' Signed by ' + escapeHtml(signature.signer !== '' ? signature.signer : '<Unknown>')
		+ ' (GPG Key Id: ' + escapeHtml(signature.key !== '' ? signature.key : '<Unknown>') + ')">'
		+ (signature.status === GG.GitSignatureStatus.GoodAndValid
			? SVG_ICONS.passed
			: signature.status === GG.GitSignatureStatus.Bad
				? SVG_ICONS.failed
				: SVG_ICONS.inconclusive)
		+ '</span>';
}

function closeDialogAndContextMenu() {
	if (dialog.isOpen()) dialog.close();
	if (contextMenu.isOpen()) contextMenu.close();
}
