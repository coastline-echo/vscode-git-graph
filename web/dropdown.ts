interface DropdownOption {
	readonly name: string;
	readonly value: string;
	readonly hint?: string;
}

/**
 * 实现 Git Graph View 顶部控制栏中使用的下拉输入
 */
class Dropdown {
	private readonly showInfo: boolean;
	private readonly multipleAllowed: boolean;
	private readonly changeCallback: (values: string[]) => void;

	private options: ReadonlyArray<DropdownOption> = [];
	private optionsSelected: boolean[] = [];
	private lastSelected: number = 0; // Only used when multipleAllowed === false
	private dropdownVisible: boolean = false;
	private lastClicked: number = 0;
	private doubleClickTimeout: NodeJS.Timer | null = null;

	private readonly elem: HTMLElement;
	private readonly currentValueElem: HTMLDivElement;
	private readonly menuElem: HTMLDivElement;
	private readonly optionsElem: HTMLDivElement;
	private readonly noResultsElem: HTMLDivElement;
	private readonly filterInput: HTMLInputElement;

	/**
	 * 构造一个下拉菜单实例。
	 * @param id 下拉菜单应在其中呈现的 HTML 元素的 ID
	 * @param showInfo 是否应在每个下拉菜单的右侧显示一个信息图标
	 * @param multipleAllowed 能否选择多个项目
	 * @param dropdownType 下拉菜单的内容类型，用于显示在过滤输入框的占位符中
	 * @param changeCallback 下拉菜单的选定项更改时要调用的回调
	 * @returns 下拉菜单实例
	 */
	constructor(id: string, showInfo: boolean, multipleAllowed: boolean, dropdownType: string, changeCallback: (values: string[]) => void) {
		this.showInfo = showInfo;
		this.multipleAllowed = multipleAllowed;
		this.changeCallback = changeCallback;
		this.elem = document.getElementById(id)!;

		this.menuElem = document.createElement('div');
		this.menuElem.className = 'dropdownMenu';

		let filter = this.menuElem.appendChild(document.createElement('div'));
		filter.className = 'dropdownFilter';

		this.filterInput = filter.appendChild(document.createElement('input'));
		this.filterInput.className = 'dropdownFilterInput';
		this.filterInput.placeholder = '过滤 ' + dropdownType + '...';

		this.optionsElem = this.menuElem.appendChild(document.createElement('div'));
		this.optionsElem.className = 'dropdownOptions';

		this.noResultsElem = this.menuElem.appendChild(document.createElement('div'));
		this.noResultsElem.className = 'dropdownNoResults';
		this.noResultsElem.innerHTML = '未找到结果';

		this.currentValueElem = this.elem.appendChild(document.createElement('div'));
		this.currentValueElem.className = 'dropdownCurrentValue';

		alterClass(this.elem, 'multi', multipleAllowed);
		this.elem.appendChild(this.menuElem);

		document.addEventListener('click', (e) => {
			if (!e.target) return;
			if (e.target === this.currentValueElem) {
				this.dropdownVisible = !this.dropdownVisible;
				if (this.dropdownVisible) {
					this.filterInput.value = '';
					this.filter();
				}
				this.elem.classList.toggle('dropdownOpen');
				if (this.dropdownVisible) this.filterInput.focus();
			} else if (this.dropdownVisible) {
				if ((<HTMLElement>e.target).closest('.dropdown') !== this.elem) {
					this.close();
				} else {
					const option = <HTMLElement | null>(<HTMLElement>e.target).closest('.dropdownOption');
					if (option !== null && option.parentNode === this.optionsElem && typeof option.dataset.id !== 'undefined') {
						this.onOptionClick(parseInt(option.dataset.id!));
					}
				}
			}
		}, true);
		document.addEventListener('contextmenu', () => this.close(), true);
		this.filterInput.addEventListener('keyup', () => this.filter());
	}

	/**
	 * 设置应显示在下拉菜单中的选项。
	 * @param options 在下拉菜单中显示的选项数组
	 * @param optionsSelected 下拉菜单中已选选项的数组
	 */
	public setOptions(options: ReadonlyArray<DropdownOption>, optionsSelected: string[]) {
		this.options = options;
		this.optionsSelected = [];
		let selectedOption = -1, isSelected;
		for (let i = 0; i < options.length; i++) {
			isSelected = optionsSelected.includes(options[i].value);
			this.optionsSelected[i] = isSelected;
			if (isSelected) {
				selectedOption = i;
			}
		}
		if (selectedOption === -1) {
			selectedOption = 0;
			this.optionsSelected[selectedOption] = true;
		}
		this.lastSelected = selectedOption;
		if (this.dropdownVisible && options.length <= 1) this.close();
		this.render();
		this.clearDoubleClickTimeout();
	}

	/**
	 * 是否在下拉菜单中选择一个值（遵守 "全部显示 "原则）
	 * @param value 要检查的值
	 * @returns TRUE => 值已选择，FALSE => 值未选择
	 */
	public isSelected(value: string) {
		if (this.options.length > 0) {
			if (this.multipleAllowed && this.optionsSelected[0]) {
				// Multiple options can be selected, and "Show All" is selected.
				return true;
			}
			const optionIndex = this.options.findIndex((option) => option.value === value);
			if (optionIndex > -1 && this.optionsSelected[optionIndex]) {
				// The specific option is selected
				return true;
			}
		}
		return false;
	}

	/**
	 * 在下拉菜单中选择一个特定的值
	 * @param value 要选择的值
	 */
	public selectOption(value: string) {
		const optionIndex = this.options.findIndex((option) => value === option.value);
		if (this.multipleAllowed && optionIndex > -1 && !this.optionsSelected[0] && !this.optionsSelected[optionIndex]) {
			// Select the option with the specified value
			this.optionsSelected[optionIndex] = true;

			// A change has occurred, re-render the dropdown options
			const menuScroll = this.menuElem.scrollTop;
			this.render();
			if (this.dropdownVisible) {
				this.menuElem.scroll(0, menuScroll);
			}
			this.changeCallback(this.getSelectedOptions(false));
		}
	}

	/**
	 * 在下拉列表中取消选择特定值
	 * @param value 要取消选择的值
	 */
	public unselectOption(value: string) {
		const optionIndex = this.options.findIndex((option) => value === option.value);
		if (this.multipleAllowed && optionIndex > -1 && (this.optionsSelected[0] || this.optionsSelected[optionIndex])) {
			if (this.optionsSelected[0]) {
				// Show All is currently selected, so unselect it, and select all branch options
				this.optionsSelected[0] = false;
				for (let i = 1; i < this.optionsSelected.length; i++) {
					this.optionsSelected[i] = true;
				}
			}

			// Unselect the option with the specified value
			this.optionsSelected[optionIndex] = false;
			if (this.optionsSelected.every(selected => !selected)) {
				// All items have been unselected, select "Show All"
				this.optionsSelected[0] = true;
			}

			// A change has occurred, re-render the dropdown options
			const menuScroll = this.menuElem.scrollTop;
			this.render();
			if (this.dropdownVisible) {
				this.menuElem.scroll(0, menuScroll);
			}
			this.changeCallback(this.getSelectedOptions(false));
		}
	}

	/**
	 * 刷新已呈现的下拉菜单以应用样式更改
	 */
	public refresh() {
		if (this.options.length > 0) this.render();
	}

	/**
	 * 下拉菜单当前是否打开（即选项列表是否可见）
	 * @returns TRUE => 下拉菜单打开，FALSE => 下拉菜单未打开
	 */
	public isOpen() {
		return this.dropdownVisible;
	}

	/**
	 * 关闭下拉菜单
	 */
	public close() {
		this.elem.classList.remove('dropdownOpen');
		this.dropdownVisible = false;
		this.clearDoubleClickTimeout();
	}

	/**
	 * 渲染下拉菜单的内容。
	 * 这应该只在第一次渲染下拉菜单时调用。
	 * 后续调用应该使用 refresh() 方法。
	 */
	private render() {
		this.elem.classList.add('loaded');

		const curValueText = formatCommaSeparatedList(this.getSelectedOptions(true));
		this.currentValueElem.title = curValueText;
		this.currentValueElem.innerHTML = escapeHtml(curValueText);

		let html = '';
		for (let i = 0; i < this.options.length; i++) {
			const escapedName = escapeHtml(this.options[i].name);
			html += '<div class="dropdownOption' + (this.optionsSelected[i] ? ' ' + CLASS_SELECTED : '') + '" data-id="' + i + '" title="' + escapedName + '">' +
				(this.multipleAllowed && this.optionsSelected[i] ? '<div class="dropdownOptionMultiSelected">' + SVG_ICONS.check + '</div>' : '') +
				escapedName + (typeof this.options[i].hint === 'string' && this.options[i].hint !== '' ? '<span class="dropdownOptionHint">' + escapeHtml(this.options[i].hint!) + '</span>' : '') +
				(this.showInfo ? '<div class="dropdownOptionInfo" title="' + escapeHtml(this.options[i].value) + '">' + SVG_ICONS.info + '</div>' : '') +
				'</div>';
		}
		this.optionsElem.className = 'dropdownOptions' + (this.showInfo ? ' showInfo' : '');
		this.optionsElem.innerHTML = html;
		this.filterInput.style.display = 'none';
		this.noResultsElem.style.display = 'none';
		this.menuElem.style.cssText = 'opacity:0; display:block;';
		// Width must be at least 138px for the filter element.
		// Don't need to add 12px if showing (info icons or multi checkboxes) and the scrollbar isn't needed. The scrollbar isn't needed if: menuElem height + filter input (25px) < 297px
		const menuElemRect = this.menuElem.getBoundingClientRect();
		this.currentValueElem.style.width = Math.max(Math.ceil(menuElemRect.width) + ((this.showInfo || this.multipleAllowed) && menuElemRect.height < 272 ? 0 : 12), 138) + 'px';
		this.menuElem.style.cssText = 'right:0; overflow-y:auto; max-height:297px;'; // Max height for the dropdown is [filter (31px) + 9.5 * dropdown item (28px) = 297px]
		if (this.dropdownVisible) this.filter();
	}

	/**
	 * 根据用户指定的筛选条件，筛选下拉列表中显示的选项
	 */
	private filter() {
		let val = this.filterInput.value.toLowerCase(), match, matches = false;
		for (let i = 0; i < this.options.length; i++) {
			match = this.options[i].name.toLowerCase().indexOf(val) > -1;
			(<HTMLElement>this.optionsElem.children[i]).style.display = match ? 'block' : 'none';
			if (match) matches = true;
		}
		this.filterInput.style.display = 'block';
		this.noResultsElem.style.display = matches ? 'none' : 'block';
	}

	/**
	 * 获取所选下拉菜单选项的数组
	 * @param names TRUE => 返回所选选项的名称，FALSE => 返回所选选项的值
	 * @returns 所选下拉菜单选项的数组
	 */
	private getSelectedOptions(names: boolean) {
		let selected = [];
		if (this.multipleAllowed && this.optionsSelected[0]) {
			// 注意：当允许多个选定项目时，“显示全部”始终是第一个选项 （0 索引）
			return [names ? this.options[0].name : this.options[0].value];
		}
		for (let i = 0; i < this.options.length; i++) {
			if (this.optionsSelected[i]) selected.push(names ? this.options[i].name : this.options[i].value);
		}
		return selected;
	}

	/**
	 * 选择下拉选项
	 * @param option 要选择的选项的索引
	 */
	private onOptionClick(option: number) {
		// 注意：当允许多个选定项目时，“显示全部”始终是第一个选项 （0 索引）
		let change = false;
		let doubleClick = this.doubleClickTimeout !== null && this.lastClicked === option;
		if (this.doubleClickTimeout !== null) this.clearDoubleClickTimeout();

		if (doubleClick) {
			// Double click
			if (this.multipleAllowed && option === 0) {
				for (let i = 1; i < this.optionsSelected.length; i++) {
					this.optionsSelected[i] = !this.optionsSelected[i];
				}
				change = true;
			}
		} else {
			// Single Click
			if (this.multipleAllowed) {
				// Multiple dropdown options can be selected
				if (option === 0) {
					// Show All was selected
					if (!this.optionsSelected[0]) {
						this.optionsSelected[0] = true;
						for (let i = 1; i < this.optionsSelected.length; i++) {
							this.optionsSelected[i] = false;
						}
						change = true;
					}
				} else {
					if (this.optionsSelected[0]) {
						// Deselect "Show All" if it is enabled
						this.optionsSelected[0] = false;
					}

					this.optionsSelected[option] = !this.optionsSelected[option];

					if (this.optionsSelected.every(selected => !selected)) {
						// All items have been unselected, select "Show All"
						this.optionsSelected[0] = true;
					}
					change = true;
				}
			} else {
				// Only a single dropdown option can be selected
				this.close();
				if (this.lastSelected !== option) {
					this.optionsSelected[this.lastSelected] = false;
					this.optionsSelected[option] = true;
					this.lastSelected = option;
					change = true;
				}
			}

			if (change) {
				// If a change has occurred, trigger the callback
				this.changeCallback(this.getSelectedOptions(false));
			}
		}

		if (change) {
			// If a change has occurred, re-render the dropdown elements
			let menuScroll = this.menuElem.scrollTop;
			this.render();
			if (this.dropdownVisible) this.menuElem.scroll(0, menuScroll);
		}

		this.lastClicked = option;
		this.doubleClickTimeout = setTimeout(() => {
			this.clearDoubleClickTimeout();
		}, 500);
	}

	/**
	 * 清除用于检测双击的超时
	 */
	private clearDoubleClickTimeout() {
		if (this.doubleClickTimeout !== null) {
			clearTimeout(this.doubleClickTimeout);
			this.doubleClickTimeout = null;
		}
	}
}
