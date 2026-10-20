const B = require('../../utils/builder.js');
const CITE = require('../../data/citations.js');

Page({
  data: {
    who: 'a',        // 当前在设置谁：a / b
    selfSex: 'm',    // 「我」的性别：影响「他称我」的方向
    steps: [],       // 当前可选的下一步
    chain: [],       // 关系链面包屑
    nowTerm: null,   // 当前选中的称谓
    nowDesc: '',     // 当前路径描述
    aLabel: '我',
    bLabel: '我',
    result: null,    // 互称结果
    hint: 'example', // example / same / ''
    examples: B.EXAMPLES
  },

  onReady() {
    this.builders = { a: new B.Builder(), b: new B.Builder() };
    this.setData({ selfSex: B.selfSex() });
    this.refresh();
  },

  curB() { return this.builders[this.data.who]; },

  // ---------- 渲染 ----------
  refresh() {
    if (!this.builders) return;
    const b = this.curB();
    const stack = b.stack;

    this.setData({
      steps: b.next(),
      chain: [''].concat(stack).map((c, i) => ({
        text: i === 0 ? '我' : B.describePath(c),
        depth: i,
        now: i === stack.length
      })),
      nowTerm: b.isEmpty() ? null : b.term(),
      nowDesc: b.isEmpty() ? '' : b.desc(),
      // 空路径 = 「我自己」，是合法且常用的一端
      aLabel: this.builders.a.isEmpty() ? '我' : this.builders.a.term().main,
      bLabel: this.builders.b.isEmpty() ? '我' : this.builders.b.term().main
    }, () => this.compute());
  },

  compute() {
    // 空路径不是「未选择」，而是「我自己」——所以两端都可能是我
    const aIsMe = this.builders.a.isEmpty();
    const bIsMe = this.builders.b.isEmpty();

    if (aIsMe && bIsMe) { this.setData({ result: null, hint: 'example' }); return; }
    if (!aIsMe && this.builders.a.path() === this.builders.b.path()) {
      this.setData({ result: null, hint: 'same' }); return;
    }

    const r = B.mutual(this.builders.a.path(), this.builders.b.path());
    this.setData({
      hint: '',
      result: {
        aMain: aIsMe ? '我' : this.builders.a.term().main,
        aDesc: aIsMe ? '' : this.builders.a.desc(),
        aCallsB: r.aCallsB.main,
        // 这些都是「A 称呼 B」这一侧的信息，跟 aIsMe 无关：
        //   aIsMe=true 时 aCallsB 正是「我称呼 B」，反而应该带上其他叫法。
        // 之前用 aIsMe 统一置空，把我称他的辞书名一起弄丢了。
        aAlts: r.aCallsB.alts || [],
        aAge: r.aCallsB.age || null,
        aCite: CITE.get(r.aCallsB.main),
        bMain: bIsMe ? '我' : this.builders.b.term().main,
        bDesc: bIsMe ? '' : this.builders.b.desc(),
        bCallsA: r.bCallsA.main,
        bAlts: r.bCallsA.alts || [],
        bAge: r.bCallsA.age || null,
        bCite: CITE.get(r.bCallsA.main),
      }
    });
  },

  // ---------- 交互 ----------
  // 「我称他」不受性别影响，只有「他称我」会变（儿子叫爸爸 / 女儿叫妈妈）
  switchSex(e) {
    const sex = e.currentTarget.dataset.sex;
    B.setSelfSex(sex);
    this.setData({ selfSex: sex });
    this.refresh();
  },

  switchWho(e) {
    this.setData({ who: e.currentTarget.dataset.who });
    this.refresh();
  },

  onStepTap(e) {
    this.curB().push(e.currentTarget.dataset.token);
    this.refresh();
  },

  onCrumbTap(e) {
    this.curB().truncate(+e.currentTarget.dataset.depth);
    this.refresh();
  },

  undo() { this.curB().pop(); this.refresh(); },

  backToMe() { this.curB().reset(); this.refresh(); },

  useExample(e) {
    const b = this.curB();
    b.reset();
    String(e.currentTarget.dataset.path).split('').forEach(t => b.push(t));
    this.refresh();
  },

  clearOne() { this.curB().reset(); this.refresh(); },

  clearAll() {
    this.builders.a.reset();
    this.builders.b.reset();
    this.refresh();
  },

  // ---------- 转发 ----------
  /** 右上角「···」菜单转发 */
  onShareAppMessage() {
    const b = this.curB();
    const desc = b.isEmpty()
      ? '亲戚怎么称呼？点两下就知道'
      : '我和他是' + b.desc() + '，我称他「' + b.term().main + '」';
    return { title: desc, path: '/pages/index/index' };
  },

  /** 页面内分享按钮 */
  onShareTimeline() {
    const b = this.curB();
    return {
      title: b.isEmpty()
        ? '亲戚叫得准：亲戚怎么称呼，点两下就知道'
        : b.term().main + ' —— 亲戚叫得准',
      query: ''
    };
  }
});
