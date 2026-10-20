/**
 * 关系构建器 —— 支撑「我不知道他是谁，只知道关系」的提问方式
 *
 * 交互：像剥洋葱一样逐层往下点
 *   我 → 母亲 → 兄弟 → 儿子   得到「表哥」
 * 每一步都实时显示这个人的称谓，不用等全部选完。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./path.js'));
  } else {
    root.KinshipBuilder = factory(root.KinshipPath);
  }
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  /**
   * 每一步可选项。
   * 带上使用提示，避免用户点错方向。
   */
  var STEPS = [
    { token: 'F', label: '父亲', hint: '爸爸 / 老爸' },
    { token: 'M', label: '母亲', hint: '妈妈 / 老妈' },
    { token: 'B', label: '兄弟', hint: '哥哥 / 弟弟' },
    { token: 'R', label: '姐妹', hint: '姐姐 / 妹妹' },
    { token: 'S', label: '儿子', hint: '' },
    { token: 'D', label: '女儿', hint: '' },
    { token: 'W', label: '妻子', hint: '老婆' },
    { token: 'H', label: '丈夫', hint: '老公' }
  ];

  /**
   * 一步之后常接什么：给「继续往下」做智能排序
   *
   * ⚠ 关键约束：B/R（兄弟姐妹）只在「还没往下走过」时可点。
   * 因为 S·B（我儿子的兄弟）在语义上等于「我另一个儿子」，
   * 用户想描述的其实是直系亲属，点「兄弟」只会把他带偏。
   */
  var FOLLOW_UP = {
    F: ['M', 'B', 'R', 'S', 'D', 'W'],
    M: ['F', 'B', 'R', 'S', 'D', 'W'],
    B: ['S', 'D', 'B', 'R', 'W', 'H'],
    R: ['S', 'D', 'B', 'R', 'W', 'H'],
    S: ['S', 'D', 'W', 'B', 'R'],
    D: ['S', 'D', 'W', 'B', 'R'],
    W: ['S', 'D', 'B', 'R', 'F', 'M'],
    H: ['S', 'D', 'B', 'R', 'F', 'M']
  };

  /** 走完 S/D（直系下延）之后，不再允许横向跳兄弟 */
  var DOWN_TOKENS = { S: 1, D: 1 };

  /**
   * 构建一条关系路径
   */
  function Builder() {
    this.stack = [];     // 已选 token 栈
  }

  Builder.prototype = {
    /** 当前路径字符串，如 'MBS' */
    path: function () { return this.stack.join(''); },

    /** 当前路径对应的称谓 */
    term: function () { return P.termForPath(this.path()); },

    /** 路径的中文描述，如「母亲的兄弟的儿子」 */
    desc: function () { return P.describePath(this.path()); },

    /** 当前层可选的下一步（已按常见程度排序，并过滤语义无效的组合） */
    next: function () {
      if (!this.stack.length) return STEPS.slice();

      // 已经走过直系下延（S/D）后，不再提供「兄弟/姐妹」——
      // S·B 语义上等于「我另一个儿子」，会让用户越点越偏
      var wentDown = false;
      for (var i = 0; i < this.stack.length; i++) {
        if (DOWN_TOKENS[this.stack[i]]) { wentDown = true; break; }
      }
      var pool = wentDown
        ? STEPS.filter(function (s) { return s.token !== 'B' && s.token !== 'R'; })
        : STEPS;

      var last = this.stack[this.stack.length - 1];
      var prefer = FOLLOW_UP[last] || [];
      return pool.slice().sort(function (a, b) {
        var ia = prefer.indexOf(a.token), ib = prefer.indexOf(b.token);
        if (ia < 0) ia = 99;
        if (ib < 0) ib = 99;
        return ia - ib;
      });
    },

    /** 选中路径的某一段（用于面包屑点击回退） */
    push: function (token) {
      // 守卫：走过直系下延后不允许再横向跳兄弟（语义无效）
      var isSide = token === 'B' || token === 'R';
      if (isSide) {
        for (var i = 0; i < this.stack.length; i++) {
          if (DOWN_TOKENS[this.stack[i]]) return this;
        }
      }
      this.stack.push(token);
      return this;
    },
    pop: function () { this.stack.pop(); return this; },
    truncate: function (n) { this.stack = this.stack.slice(0, n); return this; },
    reset: function () { this.stack = []; return this; },
    depth: function () { return this.stack.length; },
    isEmpty: function () { return this.stack.length === 0; }
  };

  /**
   * 两个关系互称
   * @param pathA A 相对我的路径（'' 表示我）
   * @param pathB B 相对我的路径
   */
  function mutual(pathA, pathB) {
    return P.addressPair(pathA, pathB);
  }

  /**
   * 常见关系示例 —— 让用户快速理解怎么点
   */
  var EXAMPLES = [
    { label: '舅家的孩子', path: 'MBS', note: '母亲的兄弟的儿子' },
    { label: '舅家的孩子（女儿）', path: 'MBD', note: '母亲的兄弟的女儿' },
    { label: '舅家孩子的孩子', path: 'MBSS', note: '舅舅的孙子' },
    { label: '伯父家的孩子', path: 'FBS', note: '父亲的兄弟的儿子 → 堂' },
    { label: '姑姑家的孩子', path: 'FRS', note: '父亲的姐妹的儿子 → 表' },
    { label: '我的堂哥', path: 'FBS' }
  ];

  return {
    STEPS: STEPS,
    EXAMPLES: EXAMPLES,
    Builder: Builder,
    mutual: mutual,
    setSelfSex: P.setSelfSex,
    selfSex: P.selfSex,
    termForPath: P.termForPath,
    describePath: P.describePath,
    addressPair: P.addressPair
  };
});
