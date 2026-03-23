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
      search: true
    };

    extend(this.options, options);

    this.data = this.options.data;
    this.pickerEl = createDom(pickerTemplate({
      data: this.data,
      title: this.options.title

    }));

    document.body.appendChild(this.pickerEl);
    // 根据传入参数设置 CSS 变量（支持数字或字符串）
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

    // 如果 wheels 已初始化，刷新它们以适配新高度
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
    if (!searchValue.trim()) {
      return;
    }

    const searchLower = searchValue.toLowerCase();

    // 按照优先级搜索：先搜省，再搜市，再搜区
    for (let level = 0; level < this.data.length; level++) {
      const matchingItemIndex = this.data[level].findIndex(item => {
        return item.label && item.label.toLowerCase().includes(searchLower);
      });

      if (matchingItemIndex !== -1) {
        // 滚动到匹配的位置
        this._scrollToPosition(level, matchingItemIndex);

        // 如果是第一级匹配，可能需要触发联动更新
        if (level === 0) {
          // 触发 change 事件以更新联动数据
          if (this.wheels && this.wheels[0]) {
            // 这会触发 _bindEvent 中注册的 scrollEnd 回调
            this.wheels[0].refresh(); // 确保滚动生效
          }
        }
      }
    }
  }

  _scrollToPosition(levelIndex, itemIndex) {
    // 检查轮子是否已初始化
    if (this.wheels && this.wheels[levelIndex]) {
      // 使用 better-scroll 的 wheelTo 方法滚动到指定位置
      //  this.wheels[levelIndex].refresh();
      this.wheels[levelIndex].wheelTo(itemIndex, 0);

      // 更新选中状态
      if (this.selectedIndex) {
        this.selectedIndex[levelIndex] = itemIndex;
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
        let index = this.wheels[i].getSelectedIndex();
        this.selectedIndex[i] = index;

        let value = null;
        if (this.data[i].length) {
          value = this.data[i][index].value;
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
      addEvent(this.pickerSearchEl, 'input', (e) => {
        console.log(e.target.value);

        this._handleSearch(e.target.value);
      });

      addEvent(this.pickerSearchEl, 'keyup', (e) => {
        if (e.target.value === '') {
          this._resetData();
        }
      });
    }
  }

  _createWheel(wheelEl, i) {
    this.wheels[i] = new BScroll(wheelEl[i], {
      wheel: true,
      rotate: 8,
      selectedIndex: this.selectedIndex[i]
    });
    ((index) => {
      this.wheels[index].on('scrollEnd', () => {
        let currentIndex = this.wheels[index].getSelectedIndex();
        if (this.selectedIndex[i] !== currentIndex) {
          this.selectedIndex[i] = currentIndex;
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
      let oldData = this.data[index];
      this.data[index] = data;
      scrollEl.innerHTML = itemTemplate(data);

      let selectedIndex = wheel.getSelectedIndex();
      let dist = 0;
      if (oldData.length) {
        let oldValue = oldData[selectedIndex].value;
        for (let i = 0; i < data.length; i++) {
          if (data[i].value === oldValue) {
            dist = i;
            break;
          }
        }
      }
      this.selectedIndex[index] = dist;
      wheel.refresh();
      wheel.wheelTo(dist);
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
    console.log(index, dist);

    let wheel = this.wheels[index];
    console.log(wheel);
    wheel.wheelTo(dist);
  }
}