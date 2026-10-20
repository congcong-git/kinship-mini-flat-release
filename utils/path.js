/**
 * 亲属路径引擎 —— 按「关系链」组合称谓
 *
 * 为什么需要这个
 * --------------
 * 固定词表必然有缺口。真实提问是：
 *   「我舅家的孩子我该叫什么？」
 *   「我舅家孩子的孩子怎么叫我？」
 * 这类关系没写进词表就答不了，或者被错误地映射成「堂哥」。
 *
 * 做法：用路径代数描述任意亲属
 *   路径 token（相对于「当前这个人」）：
 *     F 父亲   M 母亲     （上 1 代）
 *     S 儿子   D 女儿     （下 1 代）
 *     B 兄弟   R 姐妹     （同辈）
 *     W 妻子   H 丈夫     （同辈·配偶）
 *
 *   例：舅舅家的孩子 = M·B·S（母亲的兄弟的儿子）
 *       舅舅家的孩子的孩子 = M·B·S·S
 *
 * 组合规则（中文亲属的核心逻辑）：
 *   1. 连续相同方向的 token 累加辈分：F·F = 祖父
 *   2. B/R 表示「换个家庭」，这是堂/表/堂侄的来源
 *   3. 父亲这一脉的兄弟 → 堂；母亲这一脉或姑姑家的 → 表
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../data/terms.js'));
  } else {
    root.KinshipPath = factory(root.KinshipTerms);
  }
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  // 所有中文称谓都来自词表，引擎内不再出现称谓字面量
  var TERMS = T || (typeof KinshipTerms !== 'undefined' ? KinshipTerms : null);

  // -----------------------------------------------------------------
  // 「我」的性别
  //
  // 只有直系长辈称呼晚辈时（儿子叫爸爸 / 女儿叫妈妈）才需要它，
  // 旁系称呼（堂哥、舅父、侄辈）与我无关。
  // -----------------------------------------------------------------
  var SELF_SEX = 'm';   // 'm' 男 / 'f' 女

  /** 设置「我」的性别 */
  function setSelfSex(sex) {
    if (sex === 'm' || sex === 'f') SELF_SEX = sex;
    return SELF_SEX;
  }

  /** 读「我」的性别 */
  function selfSex() { return SELF_SEX; }

  // 路径 token 定义
  var TOKENS = {
    F: { name: '父亲', s: 'm', dir: 'up' },
    M: { name: '母亲', s: 'f', dir: 'up' },
    S: { name: '儿子', s: 'm', dir: 'down' },
    D: { name: '女儿', s: 'f', dir: 'down' },
    B: { name: '兄弟', s: 'm', dir: 'side' },
    R: { name: '姐妹', s: 'f', dir: 'side' },
    W: { name: '妻子', s: 'f', dir: 'spouse' },
    H: { name: '丈夫', s: 'm', dir: 'spouse' }
  };

  /** 代数：F/M = +1，S/D = -1，其余 0 */
  function generation(path) {
    path = typeof path === 'string' ? path.split('') : path;
    var g = 0;
    for (var i = 0; i < path.length; i++) {
      var t = TOKENS[path[i]];
      if (!t) continue;
      if (t.dir === 'up') g += 1;
      else if (t.dir === 'down') g -= 1;
    }
    return g;
  }

  /** 末端性别：由路径最后一个 token 决定 */
  function gender(path) {
    path = typeof path === 'string' ? path.split('') : path;
    if (!path.length) return 'm';
    var t = TOKENS[path[path.length - 1]];
    return t ? t.s : 'm';
  }

  /** 把路径描述成中文短语，如「母亲的兄弟的儿子」。兼容字符串与数组 */
  function describePath(path) {
    if (!path) return '我';
    var arr = typeof path === 'string' ? path.split('') : path;
    if (!arr.length) return '我';
    return arr.map(function (c) {
      var t = TOKENS[c];
      return t ? t.name : c;
    }).join('的');
  }

  // -----------------------------------------------------------------
  // 称谓生成
  // -----------------------------------------------------------------

  /**
   * 核心：算出「我」对某人的称谓
   * @param path 路径字符串，如 'MBS'
   * @returns { main, alts, note }
   */
  function termForPath(path) {
    if (!path) return T.self;
    var arr = typeof path === 'string' ? path.split('') : path;
    // 过滤非法 token，容错而不是崩溃
    var valid = arr.filter(function (c) { return !!TOKENS[c]; });
    if (!valid.length) {
      return T.unknown;
    }
    if (valid.length !== arr.length) {
      return { main: describePath(valid), alts: T.partialUnknown };
    }
    path = valid;

    // 拆分：末尾的配偶 token 单独处理
    var body = path, spouse = null;
    var last = path[path.length - 1];
    if (TOKENS[last] && TOKENS[last].dir === 'spouse') {
      body = path.slice(0, -1);
      spouse = last;
    }

    // ⚠ 性别必须取 body 的，不能取整条 path 的：
    //   F·R·H 的末位是 H（丈夫），按整条算会得到「男性」，
    //   于是 bodyTerm 把 R（姑姑，女性）错当成男性 → 输出「伯父」。
    var sex = gender(body);

    var inner = bodyTerm(body, sex);
    if (!inner) return { main: describePath(path), alts: [] };

    // 配偶后缀：用专门的姻亲词表，不能简单拼接（孙媳 ≠ 孙女 + 妻子）
    if (spouse) {
      return withSpouse(inner, body, spouse);
    }
    return inner;
  }

  /** 给某人加配偶称谓：儿媳 / 女婿 / 孙媳 / 孙女婿 / 姑父 … */
  function withSpouse(inner, body, spouse) {
    var arr = (typeof body === 'string' ? body.split('') : (body || []))
      .filter(function (c) { return TOKENS[c] && TOKENS[c].dir !== 'spouse'; });
    var gen = generation(arr);
    var isWife = spouse === 'W';
    var base = inner.main;
    var collateral = false;
    for (var i = 0; i < arr.length; i++) {
      if (TOKENS[arr[i]].dir === 'side') { collateral = true; break; }
    }

    // 旁系长辈的配偶（姑姑的丈夫=姑父、舅舅的妻子=舅妈…）
    if (collateral && gen >= 0) {
      var inlaw = T.spouseOf(base, isWife);
      if (inlaw) return inlaw;
    }

    // 我的直接晚辈配配偶 → 儿媳 / 女婿
    if (gen === -1) return T.inlaw(isWife ? 'daughterInLaw' : 'sonInLaw');
    // 孙辈配配偶
    if (gen === -2) {
      var viaD2 = arr.length && arr[0] === 'D';
      if (isWife) return T.inlaw(viaD2 ? 'outerGranddaughterInLaw' : 'granddaughterInLaw');
      return T.inlaw(viaD2 ? 'outerGrandsonInLaw' : 'grandsonInLaw');
    }
    if (gen === -3) return T.inlaw(isWife ? 'greatGranddaughterInLaw' : 'greatGrandsonInLaw');
    // 同辈配偶
    if (gen === 0) return T.inlaw(isWife ? 'sisterInLawWife' : 'sisterInLawHusband');
    // 长辈的配偶（我的父母等）
    if (gen === 1) {
      return T.inlaw(isWife ? 'uncleWife' : 'uncleHusband');
    }

    return T.inlaw(isWife ? 'wife' : 'husband');
  }

  /** 不含配偶的路径 → 称谓 */
  function bodyTerm(path, sex) {
    if (!path || !path.length) return T.parentOf(sex);

    // 剔除配偶 token（termForPath 已剥离，这里兜底防止旁系路径含 W/H）
    var p = path.filter(function (c) {
      return TOKENS[c] && TOKENS[c].dir !== 'spouse';
    });
    if (!p.length) return T.parentOf(sex);

    var g = generation(p);

    // ---- 开头连续的 up token ----
    var upCount = 0;
    while (upCount < p.length && TOKENS[p[upCount]] &&
      TOKENS[p[upCount]].dir === 'up') upCount++;

    var hasDown = false;
    for (var i = 0; i < p.length; i++) {
      if (TOKENS[p[i]].dir === 'down') hasDown = true;
    }

    // 纯直系上溯
    if (upCount === p.length) {
      return directUpWord(p.length, p[0] === 'M', sex, p);
    }

    // 纯直系下延
    var downCount = 0;
    while (downCount < p.length && TOKENS[p[downCount]] &&
      TOKENS[p[downCount]].dir === 'down') downCount++;
    if (downCount === p.length) {
      return directDownWord(p.length, p[0] === 'D', sex);
    }

    /**
     * 先上后下（含「上→下→再上」的回溯）
     *
     * 这类路径没有 side token，但落点仍是血亲。核心是算「净代数」：
     *   net = 全部 up 数 − 全部 down 数   （相对我的辈分差，正=长辈）
     *
     *   M·S    母亲的儿子   net=0 → 我的兄弟（同母）✓
     *   F·S·S 侄辈          net=-1 → 我的侄子
     *   F·F·S  祖父的儿子   net=1  → 我的伯父（祖父的另一个儿子）
     *   F·F·S·F              net=2  → 伯父的父亲 = 我的曾祖父
     *   F·F·S·S 祖父的孙子   net=0，但落点在孙辈层 → 我的堂侄
     *
     * ⚠ 之前用 upCount（只数开头连续 up）算代数，路径里再出现 up 就错乱，
     *   导致 F·F·S·F（曾祖父）被当成同辈给了「表哥」。
     */
    var totalDown2 = countDir(p, 'down');

    /**
     * 「上→下→再上」不是绕圈歧义，而是**回溯到原祖先**——落点是确定的。
     *
     *   F·F·S·F   祖父 → 儿子 → 父亲   = 祖父本人
     *   F·F·S·F·F 再往上              = 曾祖父
     *   F·S·F     父亲 → 儿子 → 父亲   = 我父亲
     *
     * 因为「某人的儿子」的父亲必然是他本人，所以下延的那一步被上溯抵消，
     * 净代数 = 全部 up − 全部 down，直接走直系称谓。
     *
     * ⚠ 之前把这类一律判为「绕圈歧义」降级，白白丢了 600 多条可答的关系。
     *   真正有歧义的是「上→下→横向」（祖先的**另一个**儿子），那个由
     *   collateralWord 里的 side 判定处理。
     */
    var upTotal = countDir(p, 'up');
    var firstDownIdx = -1;
    for (var fi = 0; fi < p.length; fi++) {
      if (TOKENS[p[fi]].dir === 'down') { firstDownIdx = fi; break; }
    }
    var upAfterDown = 0;
    var lastUpTok = null;
    for (var ai = firstDownIdx + 1; ai < p.length; ai++) {
      if (TOKENS[p[ai]].dir === 'up') { upAfterDown++; lastUpTok = p[ai]; }
    }
    if (upAfterDown > 0 && countDir(p, 'side') === 0) {
      var backLv = upTotal - countDir(p, 'down');
      /**
       * 母系与否看**最后一个下延之后那段上溯的起点**，不是第一个也不是最后一个 token：
       *   F·F·S·M  祖父的儿子→母亲  = 祖母（父系）
       *   M·S·F·M  母亲→我→父亲→母亲 = 祖母（父系，回到我之后再走父系）
       *   F·S·M                 = 母亲（母系）
       */
      /**
       * 落点 1 代且末段是 M → 就是母亲（F·S·M 父亲的儿子的母亲）
       * 落点 2 代以上 → 看**首段**方向（F·F·S·M 落点是祖母，父系）
       */
      var backMat;
      if (backLv === 1 && lastUpTok === 'M') {
        backMat = true;
      } else {
        backMat = p[0] === 'M';
      }
      if (backLv > 0) return directUpWord(Math.min(backLv, 4), backMat, sex, p);
      if (backLv === 0) return T.peer('sib', sex);
      return T.nephew(false, -backLv, sex);
    }

    if (totalDown2 > 0 && countDir(p, 'side') === 0) {
      var totalUp = countDir(p, 'up');

      /**
       * 只上溯 1 代再下延 = 走的是「我父母」这条路，落点仍是直系血亲。
       *   M·S 母亲的儿子 = 我的兄弟（同母），不是表哥
       *   M·S·S 母亲的孙子 = 我的侄子，不是表侄
       */
      if (totalUp === 1) {
        var net1 = 1 - totalDown2;
        if (net1 === 0) return T.peer('sib', sex);            // 兄弟姐妹
        // 侄 / 甥 由第 2 位决定：F·S 走兄弟家（侄），F·D 走姐妹家（甥）
        if (net1 < 0) return T.nephew(p[1] === 'D', -net1, sex);
        return directUpWord(net1, p[0] === 'M', sex);         // 回到父母层以上
      }

      /**
       * 落点代数 = 开头连续上溯的层数 − 下延层数
       *
       * 关键：下延之后再上溯是「绕回同一支的祖先」，不推进层数。
       *   F·F·S·F  祖父 → 儿子(伯父) → 父亲   = 绕回祖父本人 → 祖父
       *   M·F·S·F  外祖父 → 儿子(舅舅) → 父亲 = 绕回外祖父 → 外祖父
       *   F·F·S    祖父 → 儿子(伯父)          = 伯父
       *   F·F·S·S  祖父 → 孙子                = 堂侄
       *
       * ⚠ 也不能用「总 up − 总 down」：那会把「绕一圈回原点」算成 0 代同辈。
       */
      var peak = upCount;            // 开头连续 up = 我上溯到的最高祖先层
      var net2 = peak - totalDown2;

      /**
       * 「堂」的判据：从「父亲的男性支系」分出去的同姓同宗。
       *   F·F·S·S·S 祖父的曾孙 = 堂侄  （父系 → 堂）
       *   M·F·S·S   外祖父的孙子 = 表侄 （母系 → 表）
       *
       * ⚠ 不能加 net2 >= 0 的限制：那是给长辈层加的，
       *   会把同辈/晚辈层的堂全误判成表（FFSSS 曾给「表侄」）。
       * ⚠ p[0] === 'M' 一律是表：母亲的祖先不管上溯几代都是外系。
       */
      var tangU = (p[0] === 'F');

      if (net2 > 0) {
        // 旁系长辈：伯父/姑母/舅父/姨母…（无旁系 token 的纯上下路径，父系即同宗）
        return T.collateral(p[0] === 'M', tangU, Math.min(net2, 3), sex);
      }
      if (net2 === 0) {
        /**
         * net2 === 0 只说明「落点代数和我一样」，不代表一定是「我的堂兄弟」。
         * 还要看是从第几代祖先那里分出去的：
         *
         *   F·F·S     祖父的儿子   落点是伯父（长辈，net2=1 不进这里）
         *   F·F·S·S   祖父的孙子   落点与我同辈 = 堂哥   totalDown=2=upCount
         *   F·F·S·S·S 祖父的曾孙   落点低我1代 = 堂侄   totalDown=3 > upCount
         *
         * 之前写死 totalDown === 1 才算同辈，把 2 层以上的祖辈全误判成侄辈。
         */
        if (totalDown2 === upCount) {
          // 祖辈的孙辈 → 与我同辈的堂/表兄弟
          return T.peer(tangU ? 'tang' : 'biao', sex);
        }
        // 比同辈再低（totalDown − upCount）代
        return T.collateralNephew(tangU, totalDown2 - upCount, sex, 0);
      }
      // 晚辈层：|net2| 就是低我几代
      return T.collateralNephew(tangU, -net2, sex, 0);
    }

    // ---- 旁系：堂 / 表 / 侄 / 甥 ----
    return collateralWord(p, sex, hasDown);
  }

  /** 统计某方向的 token 数 */
  function countDir(p, dir) {
    var n = 0;
    for (var i = 0; i < p.length; i++) if (TOKENS[p[i]].dir === dir) n++;
    return n;
  }

  /**
   * 先上后下、落点在长辈层：
   *   M·F   → 舅舅（外祖父的儿子，回到第 1 代）
   *   F·F   → 伯父/叔父（祖父的儿子 = 父亲的兄弟）
   */
  function upDownElder(firstTok, net, sex) {
    return T.collateral(firstTok === 'M', firstTok === 'F', net, sex);
  }

  // 直系长辈 / 晚辈：词表委托
  function directUpWord(levels, maternal, sex, path) {
    return T.directUp(levels, maternal, sex, 2);
  }

  function directDownWord(levels, viaDaughter, sex) {
    return T.directDown(levels, viaDaughter, sex, 1);
  }

  // ---- 旁系：堂 / 表 / 侄 / 甥 ----
  /**
   * 旁系称谓规则
   *
   * 关键：判断「堂」还是「表」——看路径里第一个上溯 token 是 F 还是 M，
   *      以及它后面紧跟的是 B（兄弟）还是 R（姐妹）。
   *
   *   F·B·S  父亲的兄弟的儿子  → 堂哥/堂弟   （同姓同宗）
   *   F·R·S  父亲的姐妹的儿子  → 表哥/表弟   （姑表）
   *   M·B·S  母亲的兄弟的儿子  → 表哥/表弟   （舅表）
   *   M·R·D  母亲的姐妹的女儿  → 表姐/表妹   （姨表）
   *   F·B·S·S 父亲的兄弟的孙子 → 堂侄
   *   F·B·D·D 父亲的兄弟的孙女 → 堂侄女
   */
  function collateralWord(path, sex, hasDown) {
    // 忽略配偶 token（配偶在 termForPath 里已剥离，这里兜底）
    var seq = path.filter(function (c) {
      return TOKENS[c] && TOKENS[c].dir !== 'spouse';
    });
    path = seq;
    if (!path.length) return T.self;

    var firstSideIdx = -1;
    for (var j = 0; j < path.length; j++) {
      if (TOKENS[path[j]].dir === 'side') { firstSideIdx = j; break; }
    }

    /**
     * firstUp 必须在「第一个 side 之前」找。
     * ⚠ 之前不限范围，导致 B·F·F·S（兄弟的祖父的儿子）里的 F 被当成
     *   「我先上溯」，于是 !firstUp 不成立，掉进了旁系逻辑给成「堂哥」。
     * 实际 B·F·F·S 是「横向 + 回到我这一支」，落点是伯父（长辈）。
     */
    var firstUp = null, firstUpIdx = -1;
    var upScanEnd = firstSideIdx >= 0 ? firstSideIdx : path.length;
    for (var i = 0; i < upScanEnd; i++) {
      if (TOKENS[path[i]].dir === 'up') { firstUp = path[i]; firstUpIdx = i; break; }
    }

    // 开头连续的 up 段长度 —— 这才是「旁系祖先是第几代」的正确依据。
    //   FB  → 1（父亲的兄弟 = 伯父）
    //   FFB → 2（祖父的兄弟 = 伯爷爷）
    //   MFB → 2（外祖父的兄弟 = 舅爷）
    //   FSB → 1（但混排，会被下面的守卫拦掉）
    var upRunLen = 0;
    for (var u = 0; u < path.length; u++) {
      if (TOKENS[path[u]].dir === 'up') upRunLen++;
      else break;
    }

    // ---- 无效组合：上溯与下延混排后再横向（如 F·S·B = 我兄弟的兄弟）----
    // 判据是「side 之前是否出现过 down token」：
    //   F·S·B → side 之前有 S → 「我这一支」内部的横向，语义无效
    //   M·F·B → side 之前只有 up（MF）→ 合法，是外祖父的兄弟
    var mixedBefore = false;
    for (var q = 0; q < firstSideIdx; q++) {
      if (TOKENS[path[q]].dir === 'down') { mixedBefore = true; break; }
    }
    if (firstSideIdx >= 0 && mixedBefore) {
      return { main: describePath(path), alts: T.badPathHint };
    }

    /**
     * 横向之后再绕圈（如 F·B·F·S = 伯父的父亲的儿子）
     *
     * 落点有歧义：「伯父的父亲」= 祖父，「祖父的儿子」既可以指伯父本人，
     * 也可以指伯父的兄弟。同一串 token 两种答案，代数判不出来。
     *
     * 判据：side 之后若同时出现 up 和 down（方向又变了）→ 语义不唯一。
     *   F·B·F·S  side 后 up→down  → 绕圈
     *   F·B·S    side 后只有 down → 正常（堂哥）
     *   F·R·F    side 后只有 up   → 正常（祖父）
     * 与其猜一个可能错的词，不如明确降级。
     */
    /**
     * ⚠ 只在「side 不在开头」时才算绕圈。
     *   F·B·F·S  伯父的父亲的儿子 → 歧义，降级
     *   B·F·F·S  兄弟的祖父的儿子 → 落点确定（兄弟的父亲就是我的父亲），
     *             横向回的是「我这一支」，不能拦。
     */
    if (firstSideIdx > 0) {
      var upAfter2 = 0, downAfter2 = 0;
      var sawDown2 = false, upThenDown = false;
      for (var q2 = firstSideIdx + 1; q2 < path.length; q2++) {
        var d2 = TOKENS[path[q2]].dir;
        if (d2 === 'up') {
          upAfter2++;
          if (sawDown2) { /* down 之后再 up：回到上层，落点确定 */ }
        } else if (d2 === 'down') {
          downAfter2++;
          if (upAfter2 > 0) upThenDown = true;   // up 之后再 down：祖先的另一个孩子，歧义
          sawDown2 = true;
        }
      }
      /**
       * 只有「先上溯再下延」才真的有歧义：
       *   F·B·F·S 伯父的父亲的儿子 → 伯父本人？还是伯父的兄弟？两种都成立
       * 而「先下延再上溯」落点是确定的：
       *   F·B·S·F 堂哥的父亲       → 就是我伯父，唯一答案
       *
       * ⚠ 之前只要 up/down 同时出现就降级，把 F·B·S·F 也算成歧义了。
       */
      if (upThenDown && downAfter2 > 0) {
        return { main: describePath(path), alts: T.detourHint };
      }
    }

    // ---- 无效组合：先下延再横向（如 S·B = 我儿子的兄弟）----
    // 这类路径在真实语义里指向直系亲属（S·B 其实是「我另一个儿子」），
    // 不属于旁系，如实说明而不编一个错误的称谓。
    if (firstSideIdx > 0 && firstUp === null) {
      return { main: describePath(path), alts: T.badPathHint };
    }

    // 旁系深度：从第一个 side token 之后数 down 步数。
    // 没 up token 时（如 B·S = 兄弟的儿子），side 就是我的兄弟本人，
    // 深度按 side 之后的 down 步数算，起点是我（0 代）。
    var downAfterSide = 0;
    for (var d = firstSideIdx + 1; d < path.length; d++) {
      if (TOKENS[path[d]].dir === 'down') downAfterSide++;
    }

    // ---- 以 B/R 开头：我的兄弟姐妹，或他们的子女/长辈 ----
    if (!firstUp) {
      if (firstSideIdx !== 0) return siblingWord(path, sex);

      // B = 兄弟，R = 姐妹
      var sibKid = path[0] === 'B';

      /**
       * 横向之后如果又往上走，落点回到「我这一支」——
       * 兄弟的父亲就是我的父亲，兄弟的祖父就是我的祖父。
       *   B·F·F·S 兄弟的祖父的儿子 = 祖父的儿子 = 伯父（高我 1 代）
       *   B·F·F    兄弟的祖父= 祖父（高我 2 代）
       *   B·F      兄弟的父亲     = 父亲（高我 1 代）
       *
       * ⚠ 之前只处理了「横向后下延」，往上走会掉到后面的旁系逻辑，
       *   B·F·F·S 被当成「堂哥」（同辈），实际是伯父（长辈）。
       */
      var after = path.slice(firstSideIdx + 1);
      var upAfter = 0, downAfter = 0;
      for (var ai = 0; ai < after.length; ai++) {
        if (TOKENS[after[ai]].dir === 'up') upAfter++;
        else if (TOKENS[after[ai]].dir === 'down') downAfter++;
      }
      if (upAfter > 0) {
        /**
         * 横向之后往上走。分两种，落点性质完全不同：
         *
         * ① 只有 up，没有 down → 回到**我这一支的直系祖先**
         *      B·F    兄弟的父亲   = 我的父亲    → 父亲
         *      B·F·F  兄弟的祖父   = 我的祖父    → 祖父
         *      R·M·F  姐妹的外祖父 = 我的外祖父  → 外祖父
         *    ✗ 之前这类给了「伯父/伯爷爷」（旁系词），辈分对了但把父亲说成伯父。
         *
         * ② up 之后又 down → 祖先的另一个儿子，是**旁系**
         *      B·F·F·S 兄弟的祖父的儿子 = 伯父（祖父可能不止我父亲一个儿子）
         */
        if (downAfter === 0) {
          // 母系与否看第一个上溯 token 是不是 M
          var firstUpTok = after.filter(function (c) { return TOKENS[c].dir === 'up'; })[0];
          return directUpWord(upAfter, firstUpTok === 'M', sex, path);
        }

        var sibNet = upAfter - downAfter;
        // 兄弟 / 姐妹起手，后面的上溯链决定落点属于哪一党、哪一支
        var upAfterChain = after.filter(function (c) { return TOKENS[c].dir === 'up'; });
        var afterDownTok = after.filter(function (c) { return TOKENS[c].dir === 'down'; })[0];

        /**
         * 只上溯 1 层 = 绕回「我父母」，落点仍在直系血亲内，不是堂表。
         *   B·F·S    兄弟的父亲的儿子 = 我亲兄弟（不是堂哥）
         *   B·F·D    兄弟的父亲的女儿 = 我姐妹
         *   B·S·S    兄弟的儿子        = 我侄子
         *   B·F·D·S  兄弟的父亲的女儿的儿子 = 我外甥
         */
        if (upAfterChain.length === 1) {
          if (sibNet > 0) return T.collateral(upAfterChain[0] === 'M', upAfterChain[0] === 'F', sibNet, sex);
          if (sibNet === 0) return T.peer('sib', sex);
          return T.nephew(afterDownTok === 'D', -sibNet, sex);
        }

        if (sibNet > 0) {
          return T.collateral(upAfterChain[0] === 'M', upAfterChain[1] === 'F', sibNet, sex);
        }
        if (sibNet === 0) return T.peer(upAfterChain[0] === 'M' ? 'biao' : 'tang', sex);
        return T.collateralNephew(upAfterChain[0] !== 'M', -sibNet, sex);
      }

      // B·S = 兄弟的儿子 → 侄子；R·S = 姐妹的儿子 → 外甥
      if (downAfterSide === 0) {
        // 同辈：长幼未知，主词给「哥/姐」并把弟弟/妹妹列为可选项
        return T.peer('sib', sex, 2);
      }
      return T.nephew(!sibKid, downAfterSide, sex);
    }

    // 旁系 token：以 firstSideIdx 为准。
    // 旧代码取 path[firstUpIdx + 1]，对 MFB（多次上溯后旁系）会错位。
    var nextTok = firstSideIdx >= 0 ? path[firstSideIdx] : path[firstUpIdx + 1];

    /**
     * ★「横向之后再往上走」的通用处理
     *
     * 从祖先家横跳到兄弟姐妹家之后，如果再上溯，落点是**我这一支的直系祖辈**，
     * 不是旁系长辈：
     *   F·R·F   姑姑的父亲 = 父亲的父母 = 我的祖父（不是伯父）
     *   M·R·F   姨妈的父亲 = 母亲的父母 = 我的外祖父（不是舅父）
     *   F·R·F·F 姑姑祖父的父亲             = 曾祖父
     *
     * ⚠ 之前这些落进旁系逻辑，按 tier=upRunLen 算成「伯父/舅父」，层级低了一级。
     */
    if (firstSideIdx >= 0) {
      var upAfterSide2 = 0, downAfterSide2 = 0;
      for (var u2 = firstSideIdx + 1; u2 < path.length; u2++) {
        var du2 = TOKENS[path[u2]].dir;
        if (du2 === 'up') upAfterSide2++;
        else if (du2 === 'down') downAfterSide2++;
      }
      /**
       * ⚠ 必须「side 之后没有 down」才走这条。
       *   F·B·F     伯父的父亲（纯上溯）  → 祖父
       *   F·B·S·F   堂哥的父亲（中间有下延）→ 伯父，不是祖父
       */
      if (upAfterSide2 > 0 && downAfterSide2 === 0) {
        /**
         * 横向之后往上走 = 回到我这一支的直系祖先。
         * 代数 = 「side 之前的 up 数」+「side 之后的 up 数」
         *
         *   F·B·F    伯父的父亲      → 1+1 = 2 → 祖父
         *   F·F·B·F  曾祖父兄弟的父亲 → 2+1 = 3 → 曾祖父
         *   M·R·F    姨妈的父母之一  → 1+1 = 2 → 外祖父
         *
         * ⚠ 之前用 firstUpIdx + 1 当「已上溯代数」，但 firstUpIdx 只是
         *   第一个 up 的**下标**，不是**数量**。F·F·B·F 的 firstUpIdx=0，
         *   算出 2 代（祖父），实际是 3 代（曾祖父）。
         */
        var upBeforeSide = 0;
        for (var pb = 0; pb < firstSideIdx; pb++) {
          if (TOKENS[path[pb]].dir === 'up') upBeforeSide++;
        }
        var viaRel = upBeforeSide + upAfterSide2;
        if (viaRel > 0) return directUpWord(Math.min(viaRel, 4), firstUp === 'M', sex);
        return T.peer('sib', sex);
      }
    }

    // 无 next token：就是我的父母
    if (!nextTok) {
      return T.directUp(1, firstUp === 'M', sex, 1);
    }

    // F·S = 我的兄弟；F·D = 我的姐妹
    if (firstUp === 'F' && (nextTok === 'S' || nextTok === 'D') && firstUpIdx === 0) {
      // path[2] 决定这一支是侄还是外甥；没有 path[2] 就是我的亲兄弟姐妹
      if (path[2] === 'B') return T.nephew(false, 1, sex);
      if (path[2] === 'R') return T.nephew(true, 1, sex);
      /**
       * 父亲的子女的子女 = 我的侄辈。
       *   F·S·S / F·D·S → 侄子/侄女
       *   F·S·D / F·D·D → 侄女/侄子（按末位性别）
       *   再往下（S·S）才是侄孙
       * 注意 path[2] 是「我的兄弟姐妹」的儿子/女儿，不是我的孙子。
       */
      var sibKid = path[2];
      var deeper = 0;
      for (var d2 = 3; d2 < path.length; d2++) {
        if (TOKENS[path[d2]] && TOKENS[path[d2]].dir === 'down') deeper++;
      }
      if (sibKid === 'S' || sibKid === 'D') {
        // 甥 / 侄 由 path[1] 决定：F·S 走兄弟家（侄），F·D 走姐妹家（甥）
        return T.nephew(path[1] === 'D', deeper + 1, sex);
      }
      return T.peer('sib', sex);
    }

    /**
     * 旁系发生在第几代：
     *   FB  → 1（父亲的兄弟 = 伯父，比我高 1 代）
     *   FFB → 2（祖父的兄弟 = 伯爷爷，比我高 2 代）
     *   MFB → 2（外祖父的兄弟 = 舅爷，比我高 2 代）
     */
    var tier = Math.min(Math.max(upRunLen, 1), 3);

    /**
     * 「堂 / 表」的判据：参照人（父或母）与旁系源头是否同宗。
     *
     * 民间口诀「同姓为堂，异姓为表」，落到路径上是两个条件同时成立：
     *
     *   ① 旁系跳转走 B 而不是 R —— 姐妹外嫁，子女随夫姓
     *   ② 紧邻跳转的那一步上溯是 F —— 姓沿父亲传，这一段没跨出宗族
     *
     *       F·B     末位 F → 堂（父亲的兄弟）
     *       F·F·B   末位 F → 堂（祖父的兄弟）
     *       M·F·B   末位 F → 堂（外祖父的兄弟，相对母亲同宗）
     *       F·M·B   末位 M → 表（祖母的兄弟，姓没传给我）
     *       M·M·B   末位 M → 表（外祖母的兄弟）
     *       F·F·R   走 R   → 表（祖父的姐妹嫁出去了）
     *
     * 八类落点：
     *   F·F·B 父党·堂 → 堂伯父     F·F·R 父党·表 → 表伯父
     *   F·M·B 父党·表 → 表伯父     F·M·R 父党·表 → 表伯父
     *   M·F·B 母党·堂 → 堂舅       M·F·R 母党·表 → 表舅
     *   M·M·B 母党·表 → 表舅       M·M·R 母党·表 → 表舅
     *
     * ⚠ 旧判据是 firstUp === 'F' && nextTok === 'B'，只看「我」的第一步，
     *   于是 M·F·B（外祖父兄弟的儿子）被判成表，落进父党表亲那张表，
     *   页面上出现「表伯父 / 堂舅」并列。可这两人从「我」往上第一步
     *   就分岔（父 / 母），不可能是同一个人。
     *
     * ⚠ 只看 B/R 也不行：F·M·B 走的是 B，但祖母的姓没传给我，不算同宗。
     */
    var upChain = [];
    for (var uc = 0; uc < firstSideIdx; uc++) {
      if (TOKENS[path[uc]].dir === 'up') upChain.push(path[uc]);
    }
    var sameClan = (nextTok === 'B' && upChain[upChain.length - 1] === 'F');

    /**
     * ★ 同辈 / 晚辈层的「堂」换锚点：以「我」为准，不以父母为准。
     *
     * 「堂舅」的堂是**母亲**的堂——母亲与对方同宗。
     * 「堂哥」的堂是**我**的堂——我和对方同宗。
     * 这是两个不同的锚点，不能混用：
     *
     *   M·F·B·S   外祖父兄弟的儿子   → 我称「堂舅」（母亲的堂兄）
     *   M·F·B·S·S 他的儿子           → 我称「表哥」，不是堂哥
     *                              （他是母亲的堂侄，跟我不同宗）
     *
     * 所以落点在我这一辈或更低时，只有「父系同宗」才算堂：
     *   F·B·S   父亲的兄弟的儿子 → 堂哥   ✓
     *   M·F·B·S·S                → 表哥   ✓
     */
    var meTang = (firstUp === 'F' && nextTok === 'B');

    /**
     * 旁系之后的真实上下延步数。
     *
     * ⚠ 不能只数 down：side 之后还可能有 up（绕回去）。
     *   F·B·S    堂哥          postUp 0 postDown 1
     *   F·B·S·F  堂哥的父亲=伯父 postUp 1 postDown 1  ← 少算这个 up 会变成同辈
     */
    var downSteps = 0, upAfterSideCur = 0;
    for (var k = firstSideIdx + 1; k < path.length; k++) {
      var kd = TOKENS[path[k]].dir;
      if (kd === 'down') downSteps++;
      else if (kd === 'up') upAfterSideCur++;
    }

    /**
     * ★ 选词的唯一依据是「落点代数差」，不是「下延步数」：
     *
     *   net = tier − downSteps    （正数 = 他是我的长辈）
     *
     *   FB   tier1 down0 → net 1  → 伯父
     *   FBS  tier1 down1 → net 0  → 堂哥
     *   FBSS tier1 down2 → net -1 → 堂侄
     *   FFB  tier2 down0 → net 2  → 伯爷爷
     *   FFBS tier2 down1 → net 1  → 堂伯父   ← 之前错给「表哥」
     *   MFBS tier2 down1 → net 1  → 堂舅     ← 之前错给「表伯父」
     *
     * 之前只看 downSteps，导致「祖父的兄弟的儿子」因为 down=1 被当成同辈。
     */
    var net = tier + upAfterSideCur - downSteps;

    if (net > 0) {
      /**
       * 长辈层。分两类：
       *   旁系就发生在第 1 代（FB 父亲的兄弟）→ 伯父/姑母/舅父/姨母（无前缀）
       *   旁系发生在第 2 代及以后（FFBS 祖父兄弟的儿子）
       *     → 堂伯父/表伯父（带前缀，标明是堂支还是表支）
       *
       * 深层词的「堂/表」依据是 sameClan（参照人与旁系源头是否同宗），
       * 不能用 firstUp === 'M'：
       *   F·F·R·S 祖父的姐妹 = 父亲的姑母，她儿子是我父亲的表兄弟 → 表伯
       *   首步是 F 但源头是姐妹 → 仍是「表」，不是「堂」。
       */
      var deepCol = tier >= 2 && downSteps >= 1;
      if (deepCol) {
        // 落点比我高，且旁系跳在第 2 代以上 → 必须用「党 + 宗支」两个维度选词
        return T.collateral(firstUp === 'M', sameClan, net, sex, undefined, true, tier, upChain[1]);
      }
      // 非 deep 分支也要传 tier（辞书名定位代数）与 secondUp（区分祖父支 / 祖母支）
      return T.collateral(firstUp === 'M', sameClan, net, sex, undefined, false, tier, upChain[1]);
    }
    if (net === 0) {
      // 与我同辈
      return T.peer(meTang ? 'tang' : 'biao', sex);
    }
    // 晚辈层：侄辈 / 侄孙
    return T.collateralNephew(meTang, -net, sex);
  }

  /** 同辈：兄弟 / 姐妹 / 堂表（B·S 或 R·D 这类起手） */
  function siblingWord(path, sex) {
    // 路径以 B/R 开头（没有 up token）→ 我的兄弟姐妹
    return T.peer('sib', sex);
  }

  // -----------------------------------------------------------------
  // 互称推导
  // -----------------------------------------------------------------

  /**
   * 已知「我」到 A 的路径，求「A 如何称呼我」与「我如何称呼 A」
   *
   * 这里利用一个关键性质：
   *   A 的路径是从「我」出发的，反过来就是「我」在 A 的家族里的位置。
   *   把路径反转 + 转换 token 方向，即可得到 A 视角的路径。
   */
  /**
   * 两人互称
   *
   * 难点：A 的路径是「我 → A」，A 称呼我时需要换到 A 的视角，
   *      而「A 的视角」下我家那边的称谓也会跟着变
   *      （我管伯父家孩子叫「堂哥」，他管我父母叫「伯父」）。
   *
   * 做法：把路径按「代际」拆成两段，用代数与旁系标记重建，
   *      而不是简单反转字符串。
   */
  function addressPair(pathA, pathB) {
    if (pathA === null || pathA === undefined) return null;
    var a = typeof pathA === 'string' ? pathA : pathA.join('');
    var b = typeof pathB === 'string' ? pathB : (pathB || '').join('');

    var termA = termForPath(a);      // 我称 A
    var termB = termForPath(b);      // 我称 B

    var fromA = addressFromA(a, b);  // A 称 B
    var fromB = addressFromA(b, a);  // B 称 A

    return {
      a: termA,
      b: termB,
      // aCallsB = A 称呼 B；a 为空表示 A 就是「我」，此时 fromA 已由
      // addressFromA 内部处理（b 空 → reverseTerm），不要用 termB 覆盖。
      aCallsB: fromA,
      bCallsA: fromB,
      aDesc: describePath(a),
      bDesc: describePath(b)
    };
  }

  /**
   * 路径解析结果
   *
   * 把 token 序列拆成三段，这是中文称谓判定唯一需要的信息：
   *   up    前缀上溯（F/M…）——我往上走了几代，走的是父系还是母系
   *   side  旁系跳转（B/R）——跳出到兄弟/姐妹家；0 表示同辈、1 表示父母辈
   *   down  下延（S/D…）——在旁系家族里往下走了几代
   *
   * 例：MBS = up[M] + side(1) + down[S]
   *   我 → 母亲 → 兄弟家 → 儿子 = 舅舅的儿子 = 表哥
   */
  function parsePath(path) {
    var arr = typeof path === 'string' ? path.split('') : (path || []);
    var out = { up: [], upRunLen: 0, side: 0, sideTok: null, sideIdx: -1, down: [], spouse: null };
    var mode = 'up';

    for (var i = 0; i < arr.length; i++) {
      var t = TOKENS[arr[i]];
      if (!t) continue;
      if (t.dir === 'spouse') { out.spouse = arr[i]; continue; }
      if (t.dir === 'up') {
        // 上溯只允许出现在开头（旁系之后不应再往上）
        if (mode === 'up') out.up.push(arr[i]);
        else out.down.push(arr[i]);
        continue;
      }
      if (t.dir === 'side') {
        if (out.side) return null;      // 只支持一次旁系跳转
        out.side = 1;
        out.sideTok = arr[i];
        out.sideIdx = i;
        mode = 'down';
        continue;
      }
      // down token
      out.down.push(arr[i]);
      mode = 'down';
    }
    // 开头连续 up 段长度 = 旁系祖先的代数层数
    for (var i = 0; i < arr.length; i++) {
      var d = TOKENS[arr[i]];
      if (d && d.dir === 'up') out.upRunLen++;
      else break;
    }
    return out;
  }

  /**
   * A 称呼 B 的称谓（核心）
   *
   * 之前这版只按「代数差 + 有无旁系」猜，导致：
   *   伯父→我  给出「堂侄孙」（实际是「侄子」）
   *   舅舅→我  给出「表侄孙」（实际是「外甥」）
   *   堂侄→我  给出「堂侄」（实际是「堂叔」）
   * 根因：没区分「A 是长辈还是晚辈」。旁系长辈称我为「侄」，
   *      旁系晚辈称我为「叔」，方向反了。
   */
  function addressFromA(pathA, pathB) {
    var a = typeof pathA === 'string' ? pathA : (pathA || []);
    var b = typeof pathB === 'string' ? pathB : (pathB || []);

    // A 就是「我」→ 求「我」称呼 B
    if (!a.length) return termForPath(typeof b === 'string' ? b : b.join(''));
    // B 就是「我」→ 求 A 称呼「我」
    if (!b.length) return reverseTerm(a);

    // 无效组合：先下延再横向（如 S·B），如实说明
    var ia = parsePath(a), ib = parsePath(b);
    if (!ia || !ib) return T.unknown;
    if (ia.sideIdx > 0 && !ia.up.length) return { main: describePath(a), alts: T.badPathHint };
    if (ib.sideIdx > 0 && !ib.up.length) return { main: describePath(b), alts: T.badPathHint };

    // B 相对 A 的辈分差：正数 = B 比 A 高
    var rel = generation(b) - generation(a);

    // A 与 B 的血缘关系类型（用各自相对「我」的位置推断）
    var A = profile(a);
    var B = profile(b);

    // ---- 同辈 ----
    if (rel === 0) {
      // 同一支（都从同一条血脉下来）→ 兄弟姐妹
      if (sameBlood(a, b)) {
        return T.peer('sib', gender(b), 2);
      }
      // 旁系同辈 → 堂/表（称呼取决于「我」这一方的支系）
      var mySide = profile(b);
      return T.peer(mySide.tang ? 'tang' : 'biao', gender(b));
    }

    // ---- B 是 A 的长辈 ----
    if (rel > 0) {
      if (!A.collateral) {
        // 直系长辈：爷爷、外公…
        return directUpWord(Math.min(rel, 4), B.maternal, gender(b), b);
      }
      // A 走的是旁系（叔伯姑舅姨那一层），B 更高的长辈 → 伯祖父级别
      return elderOfCollateral(A, gender(b));
    }

    // ---- B 是 A 的晚辈 ----
    // rel < 0：A 是 B 的长辈，A 称呼 B 用晚辈词（儿/孙/侄…）
    return downToB(A, -rel, gender(b));
  }

  /** 把路径归纳成「A 的身份画像」 */
  function profile(p) {
    var info = parsePath(p);
    if (!info) {
      return { collateral: false, tang: false, maternal: false, upLen: 0, sideGen: 0, downDepth: 0 };
    }

    // 旁系发生在第几代：
    //   MB  → 1（母亲的兄弟，与我同辈的长辈）
    //   MFB → 2（外祖父的兄弟，比我高 2 代 = 舅爷）
    // 这是深层旁系唯一需要的信息，之前被 upLen 混掉了。
    var sideGen = info.side > 0 ? info.upRunLen : 0;

    var maternal = info.up.length > 0 && info.up[0] === 'M';
    // 「堂」= 源头是父亲的兄弟这一支（同姓同宗）。
    // 不能要求 sideGen === 1：祖父的兄弟家（FFB·S）也是堂，只是层级更高。
    var tang = !maternal && info.side > 0 && info.sideTok === 'B';

    return {
      collateral: info.side > 0,
      tang: tang,
      maternal: maternal,
      upLen: info.up.length,
      sideGen: sideGen,
      downDepth: info.down.length,
      sideTok: info.sideTok
    };
  }

  /**
   * A 与 B 是否同一支血脉（真兄弟姐妹，而非堂表）
   * 判据：两人都没走旁系，且都是直系路径
   */
  function sameBlood(a, b) {
    var ia = parsePath(a), ib = parsePath(b);
    if (!ia || !ib) return false;
    return ia.side === 0 && ib.side === 0;
  }

  /**
   * A 称呼 B（B 是 A 的晚辈）
   * @param A      A 的画像
   * @param depth  B 比 A 低几代
   * @param sexB   B 的性别
   */
  function downToB(A, depth, sexB) {
    if (!A.collateral) return directDownWord(depth, A.maternal, sexB);
    return T.collateralNephew(!!A.tang, depth - 1, sexB);
  }

  /**
   * A 称呼 B（B 是 A 的长辈，且 A 走旁系）
   * 例如：堂侄称我（我是他的堂叔）
   */
  function elderOfCollateral(A, sexB) {
    return T.collateralUncle(!!A.tang, sexB);
  }

  /**
   * A 称呼「我」的称谓 —— 单人模式的核心
   *
   * 关键：必须按「A 在我家族里的位置」判断 A 是长辈还是晚辈，
   *      之前这版把它搞反了。
   *   A = FB（伯父，比我高 1 代）→ 他叫我「侄子」
   *   A = MB（舅舅，比我高 1 代）→ 他叫我「外甥」
   *   A = FBS（堂哥，同辈）    → 他叫我「堂弟」
   *   A = FBSS（堂侄，低 1 代）→ 他叫我「堂叔」
   */
  function reverseTerm(a) {
    var A = profile(a);
    var info = parsePath(a);
    if (!info) {
      /**
       * 多次横向跳转的路径（B·B、F·B·B、B·S·B…）目前不做细分，
       * 但**辈分是确定的**——直接给「按辈分称呼」等于把能算的说成不能算。
       *
       *   B·B      兄弟的兄弟   = 我的兄弟     → 他叫我哥哥/弟弟
       *   F·B·B    父亲的兄弟的兄弟 = 伯/叔父  → 他叫我侄子
       *   M·B·B    母亲的兄弟的兄弟 = 舅舅     → 他叫我外甥
       *   B·S·B    兄弟的儿子的兄弟 = 我侄子   → 他叫我伯父
       */
      var gg = generation(a);
      var ss = selfSex();
      var firstSide = a.split('').filter(function (c) { return c === 'B' || c === 'R'; })[0];
      var lastTok = a.charAt(a.length - 1);
      var endsUp = lastTok === 'F' || lastTok === 'M';
      if (gg > 0) {
        // 末尾回到上溯 = 绕回我这一支的直系祖先（F·B·B·F ≡ 祖父），称儿 / 孙
        // 末尾停在横向 = 真旁系（F·B·B ≡ 伯父），称侄 / 甥
        if (firstSide && !endsUp) return T.nephewCallsMe(a.charAt(0) === 'M', Math.min(gg, 4), ss);
        return directDownWord(Math.min(gg, 4), a.charAt(0) === 'M', ss);
      }
      if (gg === 0) return T.callsMe(true, ss);
      if (-gg === 1) return T.auntsChildCallsMe(firstSide === 'B', ss);
      return T.elderNamesMe(firstSide === 'R', -gg, ss);
    }

    // ---- B/R 起手：我的兄弟姐妹，或他们的后代/长辈 ----
    // 没有 up token 时，A 的第一段 side 就是「我的兄弟/姐妹」本人，
    // 这属于「侄辈称我」的口径，不能按直系算。
    if (info.up.length === 0 && info.side === 1) {
      // 无效组合：先下延再横向（如 S·B = 我儿子的兄弟 = 我另一个儿子）
      if (info.down.length > 0 && info.sideIdx > 0) {
        return { main: describePath(a), alts: T.badPathHint };
      }
      var sibKid = info.sideTok === 'B';

      /**
       * ★ 这里不能直接用 info.down：parsePath 把「side 之后的 up」也塞进了
       *   out.down（因为 mode 已切成 'down'），导致 B·F·F 被当成「两个下延」。
       *   所以自己从原始串重新数。
       */
      var restTok = a.slice(1);
      var upCnt = 0, downCnt = 0;
      for (var ri = 0; ri < restTok.length; ri++) {
        var rd = TOKENS[restTok[ri]] && TOKENS[restTok[ri]].dir;
        if (rd === 'up') upCnt++;
        else if (rd === 'down') downCnt++;
      }

      /**
       * 纯上溯 = 回到我这一支的直系祖先，不是旁系。
       *   B·F    兄弟的父亲   = 我的父亲   → 他叫我「儿子」
       *   B·F·F  兄弟的祖父   = 我的祖父   → 他叫我「孙子」
       *   R·M·F  姐妹的外祖父 = 我的外祖父 → 他叫我「外孙」
       */
      if (upCnt > 0 && downCnt === 0) {
        var matAnc = restTok[0] === 'M';
        return T.directDown(Math.min(upCnt, 4), matAnc, selfSex());
      }

      /**
       * 互称方向按**净代数**分档，不能只看下延步数：
       *   net = 上溯 − 下延（正数 = 他比我高）
       *
       *   B        net 0  → 同辈，他叫我哥哥/弟弟
       *   B·S      net-1 → 他叫我伯父/叔父
       *   B·S·S    net-2 → 他叫我侄孙
       *   B·F·S    net 0 → 同辈（父亲的另一个儿子 = 我的兄弟）
       *   B·F·F·S  net+1 → 他是我伯父，叫我侄子
       *
       * ⚠ 之前用 -downCnt 当辈分差，把 B·F·F·S 判成「低我 1 代」，
       *   结果伯父叫我「伯父」。
       */
      var matSib = restTok[0] === 'M';
      var sibNet = upCnt - downCnt;

      if (sibNet > 0) {
        // A 是我的长辈 → 他叫我侄/外甥
        return T.nephewCallsMe(matSib, sibNet, selfSex());
      }
      if (sibNet === 0) {
        // 同辈互称
        return T.callsMe(sibKid, selfSex());
      }
      if (sibNet === -1) {
        /**
         * 他的父/母是我的兄弟还是姐妹？这决定他叫我伯父还是舅父。
         *
         * 分两种路径：
         *   1. B·S / R·D  —— 没绕路，第一个 token 是 B 还是 R 直接决定
         *        B·S 兄弟的儿子 → 伯父      R·S 姐妹的儿子 → 舅父
         *   2. B·F·S·S    —— 绕回父母后再下来，要看绕回之后那个子女的性别
         *        B·F·S·S 父亲的儿子（我兄弟）→ 伯父
         *        B·F·D·S 父亲的女儿（我姐妹）→ 舅父
         *
         * ⚠ 之前统一用第一个 token（B/R），于是 B·F·D·S 这种「兄弟的父亲的女儿
         *   的儿子」被当成兄弟家，给了伯父。
         */
        var kidBrother;
        if (upCnt === 0) {
          kidBrother = sibKid;
        } else {
          var lastUpIdx = Math.max(restTok.lastIndexOf('F'), restTok.lastIndexOf('M'));
          var afterUp = restTok.slice(lastUpIdx + 1).replace(/[^SD]/g, '').charAt(0);
          kidBrother = afterUp !== 'D';
        }
        return T.auntsChildCallsMe(kidBrother, selfSex());
      }
      // 侄孙辈及以上 → 他按我的辈分叫我
      return T.nephewNamesMe(!sibKid, -sibNet, selfSex());
    }

    /**
     * 旁系之后又纯上溯 = 落点回到「我这一支」的直系祖先。
     *   F·B·F    伯父的父亲   = 我的祖父
     *   F·F·B·F  曾祖父的兄弟的父亲 = 我的曾祖父
     *   F·R·F    姑姑的父亲   = 我的祖父
     *   M·B·F    舅舅的父亲   = 我的外祖父
     *
     * 这类不是我长辈那种「旁系」，而是绕回直系，所以 A 称呼我用晚辈词。
     *
     * ⚠ parsePath 把 side 之后的 up 塞进了 down（mode 已切 'down'），
     *   导致 F·B·F 被当成「旁系+下延1代」，返回「堂哥」。
     *   这里自己从原始串重数。
     */
    if (info.side === 1 && info.sideIdx >= 0) {
      var preUp = 0;
      for (var pi = 0; pi < info.sideIdx; pi++) {
        if (TOKENS[a[pi]] && TOKENS[a[pi]].dir === 'up') preUp++;
      }
      var postUp = 0, postDown = 0;
      for (var qi = info.sideIdx + 1; qi < a.length; qi++) {
        var qd = TOKENS[a[qi]] && TOKENS[a[qi]].dir;
        if (qd === 'up') postUp++;
        else if (qd === 'down') postDown++;
      }
      // 旁系之后纯上溯 → 落点是我这一支的直系祖先
      if (postUp > 0 && postDown === 0) {
        var ancLv = preUp + postUp;
        var ancMat = a[0] === 'M';
        return T.directDown(Math.min(ancLv, 4), ancMat, selfSex());
      }
      /**
       * 其他旁系：代数差 = 上溯总数 − 下延数，自己数不用 info.down
       * （parsePath 把 side 之后的 up 也塞进 down，直接用会算错）
       *   F·B·S·F  net = 1+1−1 = 1 → 我是他长辈 → 他叫我侄子
       *   F·B·S    net = 1+0−1 = 0 → 同辈
       *   F·F·B·S  net = 2+0−1 = 1 → 他叫我侄子
       */
      var netSide = preUp + postUp - postDown;
      if (netSide > 0) {
        return T.nephewCallsMe(a[0] === 'M', netSide, selfSex());
      }
      if (netSide === 0) {
        var isTangSide = a[0] === 'F' && a[info.sideIdx] === 'B';
        return T.peer(isTangSide ? 'tang' : 'biao', selfSex());
      }
      /**
       * 我比他高几代 → 他叫我带前缀的长辈词
       *   F·B·S·S 堂侄  → 他叫我「堂叔」
       *   M·B·S·S 表侄  → 他叫我「表叔」
       */
      var isTangN = a[0] === 'F' && a[info.sideIdx] === 'B';
      return T.collateralAuntOrUncle(isTangN, -netSide, selfSex());
    }

    // ---- A 走的是旁系（跳到了某个祖先的兄弟姐妹家）----
    var isMaleA = gender(a) === 'm';
    if (A.collateral) {
      var down = A.downDepth;
      var isMale = isMaleA;

      /**
       * ★ 先按「落点代数差」处理，relGen > 0 是长辈、< 0 是晚辈，
       *   而不是只看 down（旁系之后下了几步）。
       *
       * 之前只分了 down===0 / down===1 / down>=2 三档，导致
       *   F·F·B·S（祖父兄弟的儿子，高我 1 代）落在 down===1 档，
       *   被当成同辈返回「堂哥/表哥」；更远的直接吐路径文本。
       * 正确做法：跟我称他用同一个公式 net = sideGen − down。
       */
      var netR = A.sideGen - down;
      if (netR > 0) {
        // A 是我的长辈 → A 称呼我用晚辈词（侄子/侄孙…）
        return T.nephewCallsMe(A.maternal, netR, selfSex());
      }
      if (netR === 0) {
        // 与我同辈
        return T.peer(A.tang ? 'tang' : 'biao', selfSex());
      }
      // A 是我的晚辈 → A 称呼我用长辈词（堂叔/表叔…）
      return T.collateralAuntOrUncle(A.tang, -netR, selfSex());

    }

    /**
     * 先上后下（F·F·S = 祖父的儿子 = 伯父；M·F·S = 外祖父的儿子 = 舅舅）
     * 路径里没有 side token，但落点仍是旁系长辈，A 称呼我用晚辈词。
     */
    /**
     * 「先上后下」分支只处理「连续上溯 + 连续下延」这种规整路径
     * （正则：开头若干 F/M，其后若干 S/D，见下方 tidyUpDown）。
     *
     * ⚠ 不能只看 info.up.length / info.down.length：
     *   parsePath 把「下延之后的 up」也塞进 down，所以 F·F·S·F 会算成
     *   upN=2 downN=2 → net=0 → 返回「堂哥」。
     *   而它实际是「回溯到祖父」，落点确定，应交由下面的直系分支。
     */
    var upN = info.up.length;
    var downN = info.down.length;
    var tidyUpDown = /^[FM]+[SD]+$/.test(a);
    if (tidyUpDown && upN >= 1 && downN >= 1) {
      var netA = upN - downN;
      var matA = info.up[0] === 'M';

      /**
       * 只上溯 1 代 = 走的是「我父母」这条路，落点仍在直系血亲内，
       * 不是旁系，所以不能套堂/表。
       *
       *   F·S / M·S        我的兄弟        → 同辈互称
       *   F·D / M·D        我的姐妹        → 同辈互称
       *   F·S·S            我兄弟的儿子    → 他叫我伯父（不是「父亲」）
       *   F·D·S            我姐妹的儿子    → 他叫我舅父
       *
       * ⚠ 之前这批路径掉进下面的直系分支，按代数差 g=-1 当成「我的子女」，
       *   于是侄子被算成儿子、叫我父亲。
       */
      if (upN === 1) {
        var sibIsBrother = info.down[0] !== 'D';
        if (netA === 0) return T.callsMe(sibIsBrother, selfSex());
        // A 是我兄弟姐妹的子女 → 用「侄辈怎么称呼我」，不是 nephewCallsMe
        if (-netA === 1) return T.auntsChildCallsMe(sibIsBrother, selfSex());
        return T.elderNamesMe(!sibIsBrother, -netA, selfSex());
      }

      // 上溯 2 代以上：落点确定在旁系（伯叔 / 舅姨 / 堂表）
      if (netA > 0) return T.upDownCallsMe(matA, Math.min(netA, 3), selfSex());
      // 同辈：父党为堂，母党为表（此路无横向跳转，故按首步分党即可）
      if (netA === 0) return T.peer(matA ? 'biao' : 'tang', selfSex());
      // 我是他的长辈 → 堂叔 / 表叔（母党一律表）
      return T.collateralAuntOrUncle(!matA, -netA, selfSex());
    }

    // ---- 直系 ----
    var g = generation(a);
    var sexSelf = selfSex();

    // 直系路径的母系标记：第一步是 M（母亲的父母）或 D（女儿的后代）
    var viaD = !!(info && info.down.length && info.down[0] === 'D');
    /**
     * 母系标记要看「最后一个下延之后那段上溯的起点」。
     *   F·F·S·M  落点是祖母（父系）→ 他称我「孙子」
     *   M·S·F·M  同样落点祖母    → 他称我「孙子」
     *   F·S·M    落点是母亲（母系）→ 他称我「儿子」
     * ⚠ 只用 info.up[0] 会把 F·F·S·M 判成父系没错，但 M·S·F·M 会错判成母系。
     */
    var viaM = false;
    var _lv = generation(a);
    var _lastDown = -1;
    for (var lr = 0; lr < a.length; lr++) {
      if (TOKENS[a[lr]] && TOKENS[a[lr]].dir === 'down') _lastDown = lr;
    }
    if (_lv === 1 && _lastDown >= 0 && a[a.length - 1] === 'M') {
      viaM = true;                       // F·S·M 母亲
    } else if (info && info.up.length) {
      viaM = info.up[0] === 'M';
    }

    if (g > 0) {
      // A 是我的 N 代长辈 → 他称呼我为 N 代晚辈
      return directDownWord(Math.min(g, 4), viaM, sexSelf);
    }
    if (g < 0) {
      /**
       * A 是我的晚辈 → 他称呼我为长辈。
       *
       * ⚠ 低 1 代 = 我的子女，叫我父亲 / 母亲，只与**我的性别**有关，
       *   跟「经由儿子还是女儿」无关。
       *   之前把 viaD（经由女儿）直接当 maternal 传下去，导致
       *   D（女儿）叫我「母亲」——女儿的性别被我当成了我的性别。
       *
       * 低 2 代及以下才用 viaD 决定「外」字：
       *   S·D 儿子的女儿 = 孙女   → 祖父
       *   D·S 女儿的儿子 = 外孙   → 外祖父
       */
      if (-g === 1) return directUpWord(1, false, sexSelf, null);
      return directUpWord(Math.min(-g, 4), viaD, sexSelf, null);
    }
    // 同辈
    return T.callsMe(true, sexSelf);
  }

  /** 反转路径：F↔S, M↔D, B→B, R→R, W→W, H→H */
  var INVERSE = { F: 'S', S: 'F', M: 'D', D: 'M', B: 'B', R: 'R', W: 'W', H: 'H' };
  function reversePath(path) {
    var arr = typeof path === 'string' ? path.split('') : (path || []);
    var out = '';
    for (var i = arr.length - 1; i >= 0; i--) out += (INVERSE[arr[i]] || arr[i]);
    return out;
  }
  function concatPath(a, b) { return a + (b || ''); }

  // -----------------------------------------------------------------
  // 候选扩展：给 UI 提供「下一步可以怎么走」
  // -----------------------------------------------------------------

  var NEXT_OPTIONS = [
    { token: 'F', label: '父亲', hint: '爸爸' },
    { token: 'M', label: '母亲', hint: '妈妈' },
    { token: 'S', label: '儿子', hint: '' },
    { token: 'D', label: '女儿', hint: '' },
    { token: 'B', label: '兄弟', hint: '' },
    { token: 'R', label: '姐妹', hint: '' },
    { token: 'W', label: '妻子', hint: '老婆' },
    { token: 'H', label: '丈夫', hint: '老公' }
  ];

  return {
    TOKENS: TOKENS,
    NEXT_OPTIONS: NEXT_OPTIONS,
    setSelfSex: setSelfSex,
    selfSex: selfSex,
    generation: generation,
    gender: gender,
    describePath: describePath,
    termForPath: termForPath,
    reversePath: reversePath,
    addressPair: addressPair
  };
});
