import BScroll from 'better-scroll';
import EventEmitter from '../util/eventEmitter';
import { extend } from '../util/lang';
import {
  createDom,
  addEvent,
  addClass,
  removeClass
} from '../util/dom';
import pickerTemplate from './picker.handlebars';
import itemTemplate from './item.handlebars';
import './picker.styl';

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const debounce = (fn, wait = 120) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), wait);
  };
};

class VirtualWheel {
  constructor({
    wheelEl,
    data,
    selectedIndex = 0,
    windowSize = 80, // 显示条数
    bufferSize = 5  // 缓存条数
  }) {
    this.wheelEl = wheelEl;
    this.scrollEl = wheelEl.getElementsByClassName('wheel-scroll-hook')[0];
    this.data = data || [];
    this.windowSize = Math.max(windowSize, 20);
    this.bufferSize = Math.min(bufferSize, Math.floor(this.windowSize / 3));
    this.listeners = { scrollEnd: [] };
    this.selectedIndex = clamp(selectedIndex, 0, Math.max(this.data.length - 1, 0));
    this._offset = 0;
    this.isVirtual = true;

    this._renderWindow(this.selectedIndex);
    this.bs = new BScroll(wheelEl, {
      wheel: {
        selectedIndex: this.selectedIndex - this._offset,
        wheelWrapperClass: 'wheel-scroll',
        wheelItemClass: 'wheel-item'
      },
      observeDOM: false
    });

    this.bs.on('scrollEnd', () => {
      const relativeIndex = this.bs.getSelectedIndex();
      const globalIndex = clamp(this._offset + relativeIndex, 0, Math.max(this.data.length - 1, 0));
      this.selectedIndex = globalIndex;
      this._maybeShiftWindow();
      this.listeners.scrollEnd.forEach(fn => fn());
    });
  }

  _renderWindow(targetIndex) {
    const source = this.data.length ? this.data : [{ label: '', value: null }];
    const maxStart = Math.max(source.length - this.windowSize, 0);
    this._offset = clamp(targetIndex - Math.floor(this.windowSize / 2), 0, maxStart);
    const slice = source.slice(this._offset, this._offset + this.windowSize);
    this.scrollEl.innerHTML = itemTemplate(slice);
  }

  _maybeShiftWindow() {
    const lower = this._offset + this.bufferSize;
    const upper = this._offset + this.windowSize - this.bufferSize - 1;
    if (this.selectedIndex < lower || this.selectedIndex > upper) {
      this._renderWindow(this.selectedIndex);
      this.bs.refresh();
      this.bs.wheelTo(this.selectedIndex - this._offset, 0);
    }
  }

  on(name, cb) {
    if (name === 'scrollEnd') {
      this.listeners.scrollEnd.push(cb);
    } else {
      this.bs.on(name, cb);
    }
  }

  wheelTo(index, time = 0) {
    const safeIndex = clamp(index, 0, Math.max(this.data.length - 1, 0));
    this._renderWindow(safeIndex);
    this.bs.refresh();
    this.bs.wheelTo(safeIndex - this._offset, time);
    this.selectedIndex = safeIndex;
  }

  refresh() {
    this.bs.refresh();
  }

  enable() {
    this.bs.enable();
  }

  disable() {
    this.bs.disable();
  }

  getSelectedIndex() {
    return this.selectedIndex;
  }

  updateData(data, targetIndex = 0) {
    this.data = data || [];
    const safeTarget = clamp(targetIndex, 0, Math.max(this.data.length - 1, 0));
    this._renderWindow(safeTarget);
    this.bs.refresh();
    this.bs.wheelTo(safeTarget - this._offset, 0);
    this.selectedIndex = safeTarget;
    return safeTarget;
  }

  destroy() {
    if (this.bs && typeof this.bs.destroy === 'function') {
      this.bs.destroy();
    }
    this.listeners = { scrollEnd: [] };
  }
}

export default class Picker extends EventEmitter {
  constructor(options) {
    super();

    this.options = {
      data: [],
      title: '',
      selectedIndex: null,
      showCls: 'show',
      cancel: false,
      panelHeight: '356px', // 未完善的字段
      search: true,
      virtualThreshold: 800,
      virtualWindow: 80,
      virtualBuffer: 20,
      searchDebounce: 120
    };

    extend(this.options, options);

    this.data = this.options.data;
    this.useVirtualFlags = this.data.map(list => Array.isArray(list) && list.length > this.options.virtualThreshold);
    const renderData = this.data.map((column, idx) => {
      if (!Array.isArray(column)) {
        return [];
      }
      if (this.useVirtualFlags[idx]) {
        const windowSize = Math.min(this.options.virtualWindow, column.length);
        return column.slice(0, windowSize);
      }
      return column;
    });
    this.pickerEl = createDom(pickerTemplate({
      data: renderData,
      title: this.options.title

    }));

    document.body.appendChild(this.pickerEl);
    //  this._applyHeightOptions(this.options);
    this.maskEl = this.pickerEl.getElementsByClassName('mask-hook')[0];
    this.wheelEl = this.pickerEl.getElementsByClassName('wheel-hook');
    this.panelEl = this.pickerEl.getElementsByClassName('panel-hook')[0];
    this.confirmEl = this.pickerEl.getElementsByClassName('confirm-hook')[0];
    this.cancelEl = this.pickerEl.getElementsByClassName('cancel-hook')[0];
    this.cancelChooseEl = this.pickerEl.getElementsByClassName('picker-choose')[0];
    this.cancelBottomEl = this.pickerEl.getElementsByClassName('cancel-hook-bottom')[0];
    this.cancelMaskEl = this.pickerEl.getElementsByClassName('mask-hook')[0];
    this.pickerSearchEl = this.pickerEl.getElementsByClassName('picker-search')[0];
    this.pickerSearchWrapperEl = this.pickerEl.getElementsByClassName('picker-search-wrapper')[0];
    this.scrollEl = this.pickerEl.getElementsByClassName('wheel-scroll-hook');
    this._showPanel();
    this._init();
  }
  _toCssVal(v, fallback) {
    if (typeof v === 'number') return v + 'px';
    if (typeof v === 'string' && v.length) return v;
    return fallback;
  }
  _applyHeightOptions(opts) {
    // opts may be this.options or a partial object
    const root = this.pickerEl;
    if (!root) return;
    const panelH = this._toCssVal(opts.panelHeight, '323px');

    root.style.setProperty('--picker-panel-height', panelH);


    if (this.wheels && this.wheels.length) {
      for (let i = 0; i < this.wheels.length; i++) {
        try { this.wheels[i].refresh(); } catch (e) { }
      }
    }
  }

  _showPanel() {
    if (this.options.cancel) {
      this.cancelBottomEl.style.display = 'block';
    } else {
      this.confirmEl.style.width = '120px';
    }

    if (this.options.search) {
      this.pickerSearchWrapperEl.style.display = 'block';
      this.cancelChooseEl.style.display = 'none';
    }
  }

  _init() {
    this.selectedIndex = [];
    this.selectedVal = [];
    if (this.options.selectedIndex) {
      this.selectedIndex = this.options.selectedIndex;
    } else {
      for (let i = 0; i < this.data.length; i++) {
        this.selectedIndex[i] = 0;
      }
    }

    this._bindEvent();
  }
  _handleSearch(searchValue) {
    const value = searchValue.trim();
    if (!value) {
      this._resetData();
      return;
    }

    const searchLower = value.toLowerCase();

    // 按照优先级搜索：先搜省，再搜市，再搜区
    for (let level = 0; level < this.data.length; level++) {
      const column = Array.isArray(this.data[level]) ? this.data[level] : [];
      const matchingItemIndex = column.findIndex(item => {
        return item.label && item.label.toLowerCase().includes(searchLower);
      });

      if (matchingItemIndex !== -1) {
         // 滚动到匹配的位置
        this._scrollToPosition(level, matchingItemIndex);

      }
    }
  }

  _resetData() {
    for (let i = 0; i < this.data.length; i++) {
      const column = Array.isArray(this.data[i]) ? this.data[i] : [];
      const maxIndex = Math.max(column.length - 1, 0);
      const targetIndex = clamp(this.selectedIndex[i] || 0, 0, maxIndex);
      this._scrollToPosition(i, targetIndex);
    }
  }

  _scrollToPosition(levelIndex, itemIndex) {
    // 检查轮子是否已初始化
    if (this.wheels && this.wheels[levelIndex]) {
      const column = Array.isArray(this.data[levelIndex]) ? this.data[levelIndex] : [];
      const maxIndex = Math.max(column.length - 1, 0);
      const safeIndex = clamp(itemIndex, 0, maxIndex);
  // 使用 better-scroll 的 wheelTo 方法滚动到指定位置
      //  this.wheels[levelIndex].refresh();
      this.wheels[levelIndex].wheelTo(safeIndex, 0);

      // 更新选中状态
      if (this.selectedIndex) {
        this.selectedIndex[levelIndex] = safeIndex;
      }
    }
  }

  _bindEvent() {
    addEvent(this.pickerEl, 'touchmove', (e) => {
      e.preventDefault();
    });

    addEvent(this.confirmEl, 'click', () => {
      this.hide();

      let changed = false;
      for (let i = 0; i < this.data.length; i++) {
        const column = Array.isArray(this.data[i]) ? this.data[i] : [];
        let index = this.wheels[i].getSelectedIndex();
        this.selectedIndex[i] = index;

        let value = null;
        if (column.length) {
          value = column[index] && column[index].value;
        }
        if (this.selectedVal[i] !== value) {
          changed = true;
        }
        this.selectedVal[i] = value;
      }

      this.trigger('picker.select', this.selectedVal, this.selectedIndex);

      if (changed) {
        this.trigger('picker.valuechange', this.selectedVal, this.selectedIndex);
      }
    });
    if (this.cancelEl) {
      addEvent(this.cancelEl, 'click', () => {
        this.hide();
        this.trigger('picker.cancel');
      });
    }

    addEvent(this.cancelBottomEl, 'click', () => {
      this.hide();
      this.trigger('picker.cancel.bottom');
    });

    addEvent(this.cancelMaskEl, 'click', () => {
      this.hide();
      this.trigger('picker.cancel');
    });

    if (this.pickerSearchEl) {
      const triggerSearch = debounce((val) => this._handleSearch(val), this.options.searchDebounce);

      addEvent(this.pickerSearchEl, 'input', (e) => {
        triggerSearch(e.target.value || '');
      });

      addEvent(this.pickerSearchEl, 'keyup', (e) => {
        if (e.target.value === '') {
          this._resetData();
        }
      });
    }
  }

  _createWheel(wheelEl, i) {
    const columnData = Array.isArray(this.data[i]) ? this.data[i] : [];
    const useVirtual = this.useVirtualFlags && this.useVirtualFlags[i];
    const selectedIndex = clamp(this.selectedIndex[i] || 0, 0, Math.max(columnData.length - 1, 0));

    if (useVirtual) {
      this.wheels[i] = new VirtualWheel({
        wheelEl: wheelEl[i],
        data: columnData,
        selectedIndex,
        windowSize: this.options.virtualWindow,
        bufferSize: this.options.virtualBuffer
      });
    } else {
      this.wheels[i] = new BScroll(wheelEl[i], {
        wheel: {
          selectedIndex,
          wheelWrapperClass: 'wheel-scroll',
          wheelItemClass: 'wheel-item',
          rotate: 8
        },
        observeDOM: false
      });
    }

    ((index) => {
      this.wheels[index].on('scrollEnd', () => {
        let currentIndex = this.wheels[index].getSelectedIndex();
        if (this.selectedIndex[index] !== currentIndex) {
          this.selectedIndex[index] = currentIndex;
          this.trigger('picker.change', index, currentIndex);
        }
      });
    })(i);
    return this.wheels[i];
  }

  show(next) {
    this.pickerEl.style.display = 'block';
    let showCls = this.options.showCls;

    window.setTimeout(() => {
      addClass(this.maskEl, showCls);
      addClass(this.panelEl, showCls);

      if (!this.wheels) {
        this.wheels = [];
        for (let i = 0; i < this.data.length; i++) {
          this._createWheel(this.wheelEl, i);
        }
      } else {
        for (let i = 0; i < this.data.length; i++) {
          this.wheels[i].enable();
          this.wheels[i].wheelTo(this.selectedIndex[i]);
        }
      }
      next && next();
    }, 0);
  }

  hide() {
    let showCls = this.options.showCls;
    removeClass(this.maskEl, showCls);
    removeClass(this.panelEl, showCls);

    window.setTimeout(() => {
      this.pickerEl.style.display = 'none';
      for (let i = 0; i < this.data.length; i++) {
        this.wheels[i].disable();
      }
    }, 500);
  }

  refillColumn(index, data) {
    let scrollEl = this.scrollEl[index];
    let wheel = this.wheels[index];
    if (scrollEl && wheel) {
      let oldData = this.data[index] || [];
      const nextData = Array.isArray(data) ? data : [];
      this.data[index] = nextData;
      this.useVirtualFlags[index] = Array.isArray(nextData) && nextData.length > this.options.virtualThreshold;

      let selectedIndex = typeof wheel.getSelectedIndex === 'function' ? wheel.getSelectedIndex() : 0;
      let dist = 0;
      if (oldData.length && nextData.length) {
        const oldItem = oldData[selectedIndex];
        const oldValue = oldItem && oldItem.value;
        if (oldValue !== undefined) {
          const matchIndex = nextData.findIndex(item => item.value === oldValue);
          dist = matchIndex === -1 ? 0 : matchIndex;
        }
      }

      const shouldUseVirtual = this.useVirtualFlags[index];
      const isVirtual = wheel.isVirtual === true;

      if (shouldUseVirtual && !isVirtual) {
        if (typeof wheel.destroy === 'function') {
          wheel.destroy();
        } else if (wheel.bs && typeof wheel.bs.destroy === 'function') {
          wheel.bs.destroy();
        }
        this.wheels[index] = new VirtualWheel({
          wheelEl: this.wheelEl[index],
          data: nextData,
          selectedIndex: dist,
          windowSize: this.options.virtualWindow,
          bufferSize: this.options.virtualBuffer
        });
        this.selectedIndex[index] = dist;
        return dist;
      }

      if (typeof wheel.updateData === 'function') {
        dist = wheel.updateData(nextData, dist);
      } else {
        scrollEl.innerHTML = itemTemplate(nextData);
        wheel.refresh();
        wheel.wheelTo(dist);
      }

      this.selectedIndex[index] = dist;
      return dist;
    }
  }

  refill(datas) {
    let ret = [];
    if (!datas.length) {
      return ret;
    }
    datas.forEach((data, index) => {
      ret[index] = this.refillColumn(index, data);
    });
    return ret;
  }

  scrollColumn(index, dist) {
    let wheel = this.wheels[index];
    if (wheel) {
      const column = Array.isArray(this.data[index]) ? this.data[index] : [];
      const maxIndex = Math.max(column.length - 1, 0);
      const safeDist = clamp(dist, 0, maxIndex);
      wheel.wheelTo(safeDist);
    }
  }
}

