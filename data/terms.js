/**
 * 称谓词表 —— 所有中文称谓的唯一来源
 * ====================================
 *
 * 设计原则
 * --------
 * 1. 一个概念只在这里存一份，引擎里不许出现称谓字面量。
 * 2. 同一关系的**所有叫法**都列出来：口语、书面、辞书、常见方言。
 *    页面直接全列，不做「也可能是」这种不确定提示——
 *    这些字都能用来称呼对方，分成三类反而让人犹豫。
 * 3. 名词一律用「我称他」的口径。反向（他称我）由 callsMe 系列处理。
 *
 * 资料依据
 * --------
 * 《尔雅·释亲》（战国—西汉），现存最早的亲属称谓系统：
 *   父之考为王父，父之妣为王母
 *   父之晜弟，先生为世父，后生为叔父
 *   父之姊妹为姑
 *   父之从父晜弟为从祖父；父之从祖晜弟为族父
 *   父之从父姊妹为从祖姑
 *   母之考为外王父，母之妣为外王母
 *   母之晜弟为舅；母之从父晜弟为从舅
 *   母之姊妹为从母；从母之男子为从母晜弟
 *   子之子为孙 … 曾孙之子为玄孙，玄孙之子为来孙
 *   女子子之子为外孙
 * 汉典《中国古代亲属称谓家谱总览》
 * 维基百科《汉语亲属系统》：同宗为堂，异宗为表
 *
 * 关键校正（历史 bug 记录）
 * ------------------------
 * - 上 4 代是「高祖父」，不是「玄祖父」。玄孙是**下** 4 代，方向不能混。
 * - 「从祖父」= 父之从兄弟 = 祖父兄弟的**儿子**（堂伯/堂叔）
 *   「从祖祖父」= 父之伯叔 = 祖父的**兄弟**本人
 *   这两个长期被我写反。
 * - 「从母晜弟」= 母亲姊妹的儿子（我同辈的表兄弟），不是外祖父兄弟的儿子。
 * - 姑奶奶（祖父的姐妹）的儿子随她丈夫姓，是「表」不是「堂」。
 * - 「外甥」和「外甥女」是两个人（我是男/我是女），不是同义词。
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KinshipTerms = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -----------------------------------------------------------------
  // 直系长辈：我称他
  //   key = 相对我的代数（正数往上）
  //   out = 经由母亲那条线（带「外」字）
  // -----------------------------------------------------------------
  var DIRECT_UP = {
    1: {
      m: ['父亲', '爸爸', '爸', '爹', '家父', '父'],
      f: ['母亲', '妈妈', '妈', '娘', '家母', '母']
    },
    2: {
      m: ['祖父', '爷爷', '爷', '阿公', '公公', '王父'],
      f: ['祖母', '奶奶', '婆', '阿婆', '王母']
    },
    3: {
      m: ['曾祖父', '太爷爷', '太公', '曾祖', '曾祖王父'],
      f: ['曾祖母', '太奶奶', '太婆', '曾祖王母']
    },
    4: {
      m: ['高祖父', '高祖', '老太爷', '高祖王父'],
      f: ['高祖母', '老太奶奶', '高祖王母']
    },
    out: {
      // 母系「外」字辈。1 代就是母亲本身，与主表一致。
      1: {
        m: ['母亲', '妈妈', '妈', '娘'],
        f: ['母亲', '妈妈', '妈', '娘']
      },
      2: {
        m: ['外祖父', '外公', '姥爷', '外王父'],
        f: ['外祖母', '外婆', '姥姥', '外王母']
      },
      3: {
        m: ['外曾祖父', '太姥爷', '老姥爷', '外曾王父'],
        f: ['外曾祖母', '太姥姥', '老姥姥', '外曾王母']
      },
      4: {
        m: ['外高祖父', '外高祖王父'],
        f: ['外高祖母', '外高祖王母']
      }
    }
  };

  // -----------------------------------------------------------------
  // 直系晚辈：我称他
  //   out = 经由女儿那条线（带「外」字）
  // -----------------------------------------------------------------
  var DIRECT_DOWN = {
    1: {
      m: ['儿子', '儿', '小子'],
      f: ['女儿', '闺女', '女']
    },
    2: {
      m: ['孙子', '孙儿', '孙'],
      f: ['孙女']
    },
    3: {
      m: ['曾孙', '重孙'],
      f: ['曾孙女', '重孙女']
    },
    4: {
      m: ['玄孙', '元孙'],
      f: ['玄孙女', '元孙女']
    },
    5: {
      m: ['来孙'],
      f: ['来孙女']
    },
    out: {
      2: {
        m: ['外孙', '外孙儿'],
        f: ['外孙女']
      },
      3: {
        m: ['外曾孙', '外重孙'],
        f: ['外曾孙女']
      },
      4: {
        m: ['外玄孙'],
        f: ['外玄孙女']
      },
      5: {
        m: ['外来孙'],
        f: ['外来孙女']
      }
    }
  };

  // -----------------------------------------------------------------
  // 旁系长辈：旁系本人的称谓
  //   pat = 父系同宗（堂）
  //   mat = 母系（表 / 舅 / 姨）
  //   key = 旁系发生在第几代（1 = 父亲那层，2 = 祖父那层）
  // -----------------------------------------------------------------
  var COLLATERAL = {
    pat: {
      1: {
        // 父亲的兄弟。伯 = 父之兄，叔 = 父之弟——两个人，不是同义。
        // 《尔雅·释亲》「父之晜弟，先生为世父，后生为叔父」
        m: {
          list: ['伯父', '伯伯', '伯', '大爷', '世父'],
          age: { when: '若他比父亲年幼', main: '叔父', alts: ['叔叔', '叔'] }
        },
        f: ['姑母', '姑姑', '姑妈', '姑', '姑姐']
      },
      2: {
        // 祖父的兄弟 = 从祖祖父
        m: {
          list: ['伯祖父', '伯爷爷', '伯公', '从祖祖父'],
          age: { when: '若他比祖父年幼', main: '叔祖父', alts: ['叔爷爷', '叔公'] }
        },
        f: ['姑奶奶', '姑婆', '姑太', '从祖姑']
      },
      3: {
        // 曾祖父的兄弟 = 族曾祖父
        m: {
          list: ['曾伯祖父', '曾伯爷爷', '曾伯公', '族曾祖父'],
          age: { when: '若他比曾祖父年幼', main: '曾叔祖父', alts: ['曾叔爷爷', '曾叔公'] }
        },
        f: ['曾姑奶奶', '曾姑婆', '族曾祖姑']
      }
    },
    mat: {
      1: {
        // 母亲的兄弟 / 姐妹。《尔雅》「母之晜弟为舅，母之姊妹为从母」
        // 舅、姨本身不分长幼，长幼只在口语里加「大/小」限定
        m: ['舅父', '舅舅', '舅', '娘舅'],
        f: {
          list: ['姨母', '姨妈', '姨', '阿姨', '姨儿', '从母'],
          age: { when: '若她比母亲年幼', main: '小姨', alts: ['姨妹'] }
        }
      },
      2: {
        // 外祖父的兄弟 = 舅爷；外祖父的姐妹 = 姑姥姥；外祖母的姐妹 = 姨姥姥
        m: ['舅爷', '舅公', '舅爷爷', '叔伯舅'],
        f: ['姑姥姥', '姑姥', '姨姥姥', '姨姥']
      },
      3: {
        m: ['舅太爷', '舅曾爷'],
        f: ['姑太姥姥', '姨太姥姥']
      }
    }
  };

  // -----------------------------------------------------------------
  // 深层旁系长辈：旁系跳出去之后，后代又落回长辈层
  //
  // ★ 两个互相独立的维度，不能合并：
  //
  //     党    我从父亲这边数（父党），还是从母亲这边数（母党）
  //     宗支  参照人（父 / 母）与旁系源头是否同宗：同宗为堂，不同宗为表
  //
  //   父党·堂   F·F·B·S  祖父兄弟的儿子      我称 堂伯父
  //   父党·表   F·F·R·S  祖父姐妹的儿子      我称 表伯父
  //   母党·堂   M·F·B·S  外祖父兄弟的儿子    我称 堂舅
  //   母党·表   M·F·R·S  外祖父姐妹的儿子    我称 表舅
  //
  // ⚠ 曾经把「父党·表」和「母党」并成一张 biao 表，理由是「同一个人的两种叫法」。
  //   错。F·F·R·S 和 M·F·B·S 是两个人——从「我」往上第一步就分岔（父 / 母），
  //   两条路径永远到不了同一个节点。合并的直接后果是父党表亲里混进「堂舅」、
  //   母党舅辈里混进「表伯父」。
  //
  // ★ 伯 / 叔 不是同义词，是长幼两分：伯 = 参照人之兄，叔 = 参照人之弟。
  //   路径里的 B 只表示「兄弟」，不含长幼，所以幼支单列为 age，页面上注明
  //   成立条件，不再混进「也可以叫」。母党的「舅 / 姨」本身不分长幼，
  //   故 matTang / matBiao 没有 age。
  // -----------------------------------------------------------------
  var COLLATERAL_DEEP = {
    patTang: {
      1: {
        // F·F·B·S 祖父兄弟的儿子 = 父之从兄弟。《尔雅》「父之从父晜弟为从祖父」
        m: {
          list: ['堂伯父', '堂伯', '从伯', '从祖父'],
          age: { when: '若他比父亲年幼', main: '堂叔父', alts: ['堂叔', '从叔'] }
        },
        f: ['堂姑母', '堂姑', '从姑', '从祖姑']
      },
      2: {
        // 曾祖父兄弟的儿子 = 族祖父。《尔雅》「父之从祖晜弟为族父」
        m: ['族祖父', '族父', '堂伯爷爷', '堂叔爷爷', '族伯祖父', '族叔祖父'],
        f: ['族祖姑', '堂姑奶奶', '族姑祖母']
      },
      3: {
        m: ['族曾祖父', '族曾伯公', '族曾叔公'],
        f: ['族曾祖姑']
      }
    },

    patBiao: {
      1: {
        // F·F·R·S / F·M·B·S / F·M·R·S —— 父亲的表兄弟
        m: {
          list: ['表伯父', '表伯'],
          age: { when: '若他比父亲年幼', main: '表叔父', alts: ['表叔'] }
        },
        f: ['表姑母', '表姑']
      },
      2: {
        m: ['表伯爷爷', '表叔爷爷', '表伯祖父'],
        f: ['表姑奶奶', '表姑婆']
      },
      3: {
        m: ['表曾伯爷爷', '表曾叔爷爷'],
        f: ['表曾姑奶奶']
      }
    },

    matTang: {
      1: {
        // M·F·B·S 外祖父兄弟的儿子 = 母亲的堂兄弟。
        // 《尔雅·释亲》「母之从父晜弟，为从舅」——辞书把它归入母党「舅」类，
        // 与父党的表亲不在同一章，也没有任何「伯」的成分。
        m: ['堂舅', '从舅', '堂舅父'],
        f: ['堂姨', '堂姨母']
      },
      2: {
        m: ['堂舅爷', '堂舅公', '从舅公'],
        f: ['堂姨姥姥', '从姨姥姥']
      },
      3: {
        m: ['堂舅太爷'],
        f: ['堂姨太姥姥']
      }
    },

    matBiao: {
      1: {
        // M·F·R·S / M·M·B·S / M·M·R·S —— 母亲的表兄弟
        m: ['表舅', '表舅父'],
        f: ['表姨', '表姨母']
      },
      2: {
        m: ['表舅爷', '表舅公'],
        f: ['表姨姥姥', '表姨姥']
      },
      3: {
        m: ['表舅太爷'],
        f: ['表姨太姥姥']
      }
    }
  };

  // -----------------------------------------------------------------
  // 旁系晚辈：我称他（侄 / 甥）
  //   out = 走姐妹那条线（外甥）
  // -----------------------------------------------------------------
  var NEPHEW = {
    1: {
      m: ['侄子', '侄儿', '侄', '从子'],
      f: ['侄女', '从女']
    },
    2: {
      m: ['侄孙', '从孙', '侄孙儿'],
      f: ['侄孙女', '从孙女']
    },
    3: {
      m: ['曾侄孙', '重侄孙'],
      f: ['曾侄孙女', '重侄孙女']
    },
    out: {
      1: {
        m: ['外甥', '甥', '外甥儿'],
        f: ['外甥女']
      },
      2: {
        m: ['外甥孙', '甥孙'],
        f: ['外甥孙女', '甥孙女']
      },
      3: {
        m: ['外曾甥孙', '外甥曾孙'],
        f: ['外曾甥孙女']
      }
    }
  };

  // -----------------------------------------------------------------
  // 同辈
  //   长幼未知时，哥/弟（姐/妹）都列出来，两种叫法都可能用得上。
  // -----------------------------------------------------------------
  var PEER = {
    elder: { m: ['哥哥', '哥', '兄', '兄长'], f: ['姐姐', '姐', '姊'] },
    younger: { m: ['弟弟', '弟'], f: ['妹妹', '妹'] },
    tangElder: { m: ['堂哥', '堂兄'], f: ['堂姐', '堂姊'] },
    tangYounger: { m: ['堂弟'], f: ['堂妹'] },
    biaoElder: { m: ['表哥', '表兄'], f: ['表姐', '表姊'] },
    biaoYounger: { m: ['表弟'], f: ['表妹'] }
  };

  // -----------------------------------------------------------------
  // 姻亲：配偶相关
  // -----------------------------------------------------------------
  var INLAW = {
    // 长辈的配偶
    uncleWife: ['伯母', '伯娘', '大娘', '婶母', '婶婶', '婶娘', '叔母'],
    uncleHusband: ['姑父', '姑丈', '姑爷'],
    auntWife: ['舅妈', '舅母', '妗子'],
    auntHusband: ['姨父', '姨丈', '姨夫'],
    // 祖辈的配偶
    grandUncleWife: ['伯奶奶', '伯婆', '叔奶奶', '叔婆', '从祖祖母'],
    grandAuntHusband: ['姑爷爷', '姑公', '姑丈公'],
    grandAuntWife: ['舅奶奶', '舅婆', '妗婆', '从舅母'],
    grandAuntOutHusband: ['姨爷爷', '姨公'],
    // 我的晚辈的配偶
    daughterInLaw: ['儿媳', '媳妇', '儿媳妇', '新妇'],
    sonInLaw: ['女婿', '婿', '姑爷', '东床'],
    granddaughterInLaw: ['孙媳', '孙媳妇'],
    grandsonInLaw: ['孙女婿'],
    outerGranddaughterInLaw: ['外孙媳'],
    outerGrandsonInLaw: ['外孙女婿'],
    // 同辈的配偶
    brotherWife: ['嫂子', '嫂嫂', '嫂', '大嫂'],
    brotherWifeYounger: ['弟妹', '弟媳', '弟妇'],
    sisterHusbandElder: ['姐夫'],
    sisterHusbandYounger: ['妹夫'],
    cousinWifeElder: ['堂嫂'],
    cousinWifeYounger: ['堂弟妹'],
    cousinHusbandElder: ['堂姐夫'],
    cousinHusbandYounger: ['堂妹夫'],
    biaoCousinWifeElder: ['表嫂'],
    biaoCousinWifeYounger: ['表弟妹'],
    biaoCousinHusbandElder: ['表姐夫'],
    biaoCousinHusbandYounger: ['表妹夫'],
    nephewWife: ['侄媳', '侄媳妇'],
    nephewHusband: ['侄女婿'],
    nieceHusband: ['侄女婿'],
    // 配偶本身
    wife: ['妻子', '老婆', '太太', '爱人', '媳妇', '内人', '夫人'],
    husband: ['丈夫', '老公', '先生', '爱人', '夫婿'],
    // 配偶的亲属（岳家 / 婆家）
    wifeFather: ['岳父', '丈人', '老丈人', '泰山', '外舅'],
    wifeMother: ['岳母', '丈母娘', '丈母', '泰水', '外姑'],
    husbandFather: ['公公', '公爹', '家公', '翁'],
    husbandMother: ['婆婆', '婆母', '家婆', '姑'],
    wifeBrotherElder: ['大舅子', '内兄', '妻兄'],
    wifeBrotherYounger: ['小舅子', '内弟', '妻弟'],
    wifeSisterElder: ['大姨子', '妻姐'],
    wifeSisterYounger: ['小姨子', '姨妹', '妻妹'],
    husbandBrotherElder: ['大伯子', '夫兄'],
    husbandBrotherYounger: ['小叔子', '夫弟'],
    husbandSisterElder: ['大姑子', '夫姐'],
    husbandSisterYounger: ['小姑子', '夫妹'],
    coBrotherInLaw: ['连襟', '襟兄', '襟弟', '娅'],
    coSisterInLaw: ['妯娌', '娣姒']
  };

  // -----------------------------------------------------------------
  // 工具
  // -----------------------------------------------------------------

  /** 从二维表取词。格可以是数组，也可以是 { list, age } */
  function pick2(table, k1, k2) {
    if (!table) return null;
    var row = table[k1];
    if (!row) return null;
    var v = row[k2];
    if (!v) return null;
    if (v instanceof Array) return v.length ? v : null;
    return (v.list && v.list.length) ? v : null;
  }

  /**
   * 从「代数表」取词，母系走 out 子表。
   * 注意：out 与数字 key 同级，必须先按 maternal 分流，不能无脑 fallback——
   * 否则 FF（祖父）会误取到 out 里的「外祖父」。
   */
  function pickGen(table, lv, key, maternal) {
    var t = maternal && table.out ? table.out : table;
    return pick2(t, lv, key);
  }

  /**
   * 词表数组 → { main, alts, age }
   *
   * alts 只放**同义**称谓：同一个人、同一种关系，只是叫法不同
   *   （伯父 / 伯伯 / 世父、堂舅 / 从舅）。
   * age 放**长幼分支**：伯与叔是两个不同的人，路径里的 B 推不出长幼，
   *   所以单列一支并写明成立条件，不能混进 alts 冒充「也可以叫」。
   *
   * @param list     词表数组，第一个作主词
   * @param maxAlts  限制备选数量；不传 = 全给
   * @param age      长幼分支 { when, main, alts }
   */
  function toTerm(list, maxAlts, age) {
    if (!list || !list.length) return null;

    // 去重（词表里可能有重复项）
    var seen = {};
    var uniq = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (!w || seen[w]) continue;
      seen[w] = 1;
      uniq.push(w);
    }
    if (!uniq.length) return null;

    var alts = uniq.slice(1);
    if (maxAlts !== undefined) alts = alts.slice(0, maxAlts);

    return { main: uniq[0], alts: alts, age: age || null };
  }

  /**
   * 词表格 → { main, alts, age }
   *
   * 表里的格有两种写法：
   *   数组          纯同义词，无长幼分支
   *   { list, age } 带长幼分支
   */
  function toEntry(entry, maxAlts) {
    if (!entry) return null;
    if (entry instanceof Array) return toTerm(entry, maxAlts);
    return toTerm(entry.list, maxAlts, entry.age);
  }

  // -----------------------------------------------------------------
  // 取词函数
  // -----------------------------------------------------------------

  /** 直系长辈 */
  function directUp(levels, maternal, sex, maxAlts) {
    var lv = Math.min(Math.max(levels, 1), 4);
    var key = sex === 'f' ? 'f' : 'm';
    var list = pickGen(DIRECT_UP, lv, key, maternal);
    if (!list && maternal) list = pickGen(DIRECT_UP, lv, key, false);
    if (!list) {
      list = maternal
        ? (key === 'f' ? ['外祖母', '外婆', '姥姥'] : ['外祖父', '外公', '姥爷'])
        : (key === 'f' ? ['祖母', '奶奶'] : ['祖父', '爷爷']);
    }
    return toTerm(list, maxAlts);
  }

  /** 直系晚辈 */
  function directDown(levels, viaDaughter, sex, maxAlts) {
    var lv = Math.min(Math.max(levels, 1), 5);
    var key = sex === 'f' ? 'f' : 'm';
    var list = null;
    if (viaDaughter && lv >= 2) list = pickGen(DIRECT_DOWN, lv, key, true);
    if (!list) list = pickGen(DIRECT_DOWN, lv, key, false);
    if (!list) list = key === 'f' ? ['孙女'] : ['孙子'];
    return toTerm(list, maxAlts);
  }

  /**
   * 旁系长辈
   * @param maternal  是否母党（从母亲这边数）
   * @param sameClan  参照人与旁系源头是否同宗：true → 堂，false → 表
   * @param net       落点代数差（高我几代）
   * @param sex       此人性别
   * @param maxAlts   备选数量
   * @param deep      是否深层旁系（落点带堂/表前缀）
   * @param sideTier  旁系发生在第几代
   * @param secondUp  上溯链第 2 层（F/M）；仅母党祖辈女性用到，见下
   */
  function collateral(maternal, sameClan, net, sex, maxAlts, deep, sideTier, secondUp) {
    var key = sex === 'f' ? 'f' : 'm';
    var tier = sideTier === undefined ? net : sideTier;

    if (deep) {
      var dl = Math.min(Math.max(net, 1), 3);
      // 党（pat/mat）与宗支（Tang/Biao）是两个维度，必须一起查，不能只查一个
      var dTable = COLLATERAL_DEEP[(maternal ? 'mat' : 'pat') + (sameClan ? 'Tang' : 'Biao')];
      if (dTable) {
        var d = toEntry(pick2(dTable, dl, key) || pick2(dTable, 1, key), maxAlts);
        if (d) return d;
      }
    }

    /**
     * 母党祖辈的女性分两个人，不能并列：
     *   M·F·R 外祖父的姐妹 → 姑姥姥
     *   M·M·R 外祖母的姐妹 → 姨姥姥
     * 只有上溯链第 2 层是 F 还是 M 能区分，所以单独处理。
     * （母党的男性两支都叫舅爷 / 舅公，不必分。）
     */
    if (maternal && key === 'f' && secondUp && tier >= 2) {
      var viaF = secondUp === 'F';
      if (tier === 2) return toTerm(viaF ? ['姑姥姥', '姑姥'] : ['姨姥姥', '姨姥'], maxAlts);
      return toTerm([viaF ? '姑太姥姥' : '姨太姥姥'], maxAlts);
    }

    /**
     * 父党祖辈两支都要分——祖父的兄弟姐妹跟我同姓，祖母的兄弟姐妹不姓：
     *   F·F·B 伯 / 叔祖父  ｜  F·M·B 舅爷爷
     *   F·F·R 姑奶奶        ｜  F·M·R 姨奶奶
     * 并列说「也可以叫舅爷爷」是错的：那是祖母那边的另一个人。
     */
    if (!maternal && secondUp && tier >= 2) {
      var viaFp = secondUp === 'F';
      if (key === 'f') {
        if (tier === 2) return toTerm(viaFp ? ['姑奶奶', '姑婆', '姑太'] : ['姨奶奶', '姨婆'], maxAlts);
        return toTerm([viaFp ? '姑太奶奶' : '姨太奶奶'], maxAlts);
      }
      if (tier === 2) {
        return viaFp
          ? toTerm(['伯祖父', '伯爷爷', '伯公'], maxAlts,
              { when: '若他比祖父年幼', main: '叔祖父', alts: ['叔爷爷', '叔公'] })
          : toTerm(['舅爷爷', '舅公', '舅爷'], maxAlts);
      }
      return toTerm([viaFp ? '伯太爷爷' : '舅太爷爷'], maxAlts);
    }

    var branch = maternal ? COLLATERAL.mat : COLLATERAL.pat;
    var t = Math.min(Math.max(tier, 1), 3);
    var entry = pick2(branch, t, key) || pick2(branch, 1, key);
    if (!entry) return toTerm(key === 'f' ? ['姑母'] : ['伯父'], maxAlts);
    return toEntry(entry, maxAlts);
  }

  /** 旁系晚辈（侄 / 甥） */
  function nephew(maternal, deep, sex, maxAlts) {
    var lv = Math.min(Math.max(deep, 1), 3);
    var key = sex === 'f' ? 'f' : 'm';
    var list = pickGen(NEPHEW, lv, key, maternal);
    if (!list && maternal) list = pickGen(NEPHEW, lv, key, false);
    if (!list) list = pick2(NEPHEW, 1, key);
    if (!list) list = key === 'f' ? ['侄女'] : ['侄子'];
    return toTerm(list, maxAlts);
  }

  /**
   * 同辈词
   * @param kind  'sib' 亲兄妹 / 'tang' 堂 / 'biao' 表
   * @param sex   目标性别
   *
   * 长幼无从判断：哥与弟是两个不同的人，不是同义词。
   * 所以「哥」作主称，弟/妹单列 age，页面上注明成立条件。
   */
  function peer(kind, sex, maxAlts) {
    var key = sex === 'f' ? 'f' : 'm';
    var elder, younger;
    if (kind === 'tang') {
      elder = PEER.tangElder; younger = PEER.tangYounger;
    } else if (kind === 'biao') {
      elder = PEER.biaoElder; younger = PEER.biaoYounger;
    } else {
      elder = PEER.elder; younger = PEER.younger;
    }
    return toTerm(elder[key], maxAlts, {
      when: key === 'f' ? '若她比我年幼' : '若他比我年幼',
      main: younger[key][0],
      alts: younger[key].slice(1)
    });
  }

  /** 姻亲词 */
  function inlaw(key) {
    return INLAW[key] ? toTerm(INLAW[key]) : null;
  }

  // -----------------------------------------------------------------
  // 「他称我」方向
  //   ⚠ alts 绝不能含另一种性别的词。
  //     「侄子」（我男）和「侄女」（我女）是两个人，不是同义词。
  // -----------------------------------------------------------------

  /** 兄弟姐妹怎么称呼我 */
  function callsMe(sibKid, selfSex) {
    if (selfSex === 'f') return { main: '妹妹', alts: ['姐姐', '姐', '妹', '姐妹'] };
    return { main: '弟弟', alts: ['哥哥', '哥', '兄弟'] };
  }

  /**
   * 兄弟姐妹的子女怎么称呼我
   *
   *   @param sibKid true = 兄弟的子女，false = 姐妹的子女
   *
   * 兄弟的子女：我在他家是「父亲的兄弟」→ 伯父/叔父（我男）或 伯母/婶母（我女）
   * 姐妹的子女：我在他家是「母亲的兄弟/姐妹」→ **舅父**（我男）或 **姨母**（我女）
   *
   * ⚠ 之前把「姐妹的子女叫我」写成了姑父/姑母，方向反了。
   *   姑父是「我父亲的姐妹的丈夫」，那是我**称呼别人**，不是我被人称呼。
   *   外甥永远叫我舅舅（男）或姨妈（女）。
   */
  function auntsChildCallsMe(sibKid, selfSex) {
    if (selfSex === 'f') {
      return sibKid
        ? { main: '伯母', alts: ['伯娘', '大娘'],
            age: { when: '若我比他父亲年幼', main: '婶母', alts: ['婶婶', '婶娘', '叔母'] } }
        : { main: '姨母', alts: ['姨妈', '姨', '阿姨'], age: null };
    }
    return sibKid
      ? { main: '伯父', alts: ['伯伯', '大爷'],
          age: { when: '若我比他父亲年幼', main: '叔父', alts: ['叔叔', '叔'] } }
      : { main: '舅父', alts: ['舅舅', '舅', '娘舅'], age: null };
  }

  /** 旁系长辈怎么称呼我 */
  function nephewCallsMe(maternal, sideGen, selfSex) {
    var f = selfSex === 'f';
    if (sideGen === 1) {
      if (f) return { main: maternal ? '外甥女' : '侄女', alts: [] };
      return {
        main: maternal ? '外甥' : '侄子',
        alts: maternal ? ['甥', '外甥儿'] : ['侄儿', '侄']
      };
    }
    if (f) {
      return { main: maternal ? '外甥孙女' : '侄孙女', alts: [] };
    }
    return {
      main: maternal ? '外甥孙' : '侄孙',
      alts: maternal ? ['甥孙'] : ['从孙']
    };
  }

  /**
   * 侄辈 / 甥辈按他们跟我的代数差称呼我
   *
   * 与我称他严格对称：
   *   我称他侄子   → 他叫我 伯父/叔父
   *   我称他侄孙   → 他叫我 伯祖父/叔祖父
   *   我称他曾侄孙 → 他叫我 曾伯祖父
   *   我称他外甥   → 他叫我 舅父（我男）/ 姨母（我女）
   *   我称他外甥孙 → 他叫我 舅公 / 姨姥姥
   *
   * ⚠ 之前这里复用了 nephewCallsMe（那是「他称我是侄」的方向），
   *   结果侄子叫我「侄子」，方向整个反了。
   *
   * @param maternal 是否姐妹那一支（甥系）
   * @param depth    他比我低几代
   * @param selfSex  我的性别
   */
  function elderNamesMe(maternal, depth, selfSex) {
    var d = Math.min(Math.max(depth, 1), 3);
    var f = selfSex === 'f';

    if (maternal) {
      // 甥系：我是他母亲的兄弟/姐妹
      if (d === 1) {
        return f
          ? { main: '姨母', alts: ['姨妈', '姨', '阿姨'], age: null }
          : { main: '舅父', alts: ['舅舅', '舅', '娘舅'], age: null };
      }
      if (d === 2) {
        return f
          ? { main: '姨姥姥', alts: ['姨姥'], age: null }
          : { main: '舅公', alts: ['舅爷', '舅爷爷'], age: null };
      }
      return f
        ? { main: '姨太姥姥', alts: [], age: null }
        : { main: '舅太爷', alts: ['舅曾爷'], age: null };
    }

    // 侄系：我是他父亲的兄弟/姐妹。伯 / 叔 取决于我和他父亲谁年长，路径推不出
    if (d === 1) {
      if (f) {
        return {
          main: '伯母', alts: ['伯娘', '大娘'],
          age: { when: '若我比他父亲年幼', main: '婶母', alts: ['婶婶', '婶娘', '叔母'] }
        };
      }
      return {
        main: '伯父', alts: ['伯伯', '大爷'],
        age: { when: '若我比他父亲年幼', main: '叔父', alts: ['叔叔', '叔'] }
      };
    }
    if (d === 2) {
      if (f) {
        return {
          main: '伯祖母', alts: ['伯婆', '从祖祖母'],
          age: { when: '若我比他祖父年幼', main: '叔祖母', alts: ['叔婆'] }
        };
      }
      return {
        main: '伯祖父', alts: ['伯公', '伯爷爷', '从祖祖父'],
        age: { when: '若我比他祖父年幼', main: '叔祖父', alts: ['叔公', '叔爷爷'] }
      };
    }
    if (f) {
      return {
        main: '曾伯祖母', alts: ['从祖祖母'],
        age: { when: '若我比他曾祖父年幼', main: '曾叔祖母', alts: [] }
      };
    }
    return {
      main: '曾伯祖父', alts: ['曾伯公', '族曾祖父'],
      age: { when: '若我比他曾祖父年幼', main: '曾叔祖父', alts: ['曾叔公'] }
    };
  }

  /** 兼容旧接口：保留名字，内部转调 elderNamesMe */
  function nephewNamesMe(maternal, deep, selfSex) {
    return elderNamesMe(maternal, deep, selfSex);
  }

  /** 「先上后下」的长辈怎么称呼我 */
  function upDownCallsMe(maternal, net, selfSex) {
    return nephewCallsMe(maternal, net, selfSex);
  }

  /** 侄辈怎么称呼我（我是堂叔/表叔那一辈） */
  /**
   * 堂 / 表长辈怎么称呼我（我是他们的堂侄 / 表侄）
   * 伯 = 他比我父亲年长，叔 = 年幼。路径推不出长幼，故以口语常用的「叔」为主。
   */
  function collateralAuntOrUncle(tang, down, sex) {
    var pre = tang ? '堂' : '表';
    if (sex === 'f') return { main: pre + '姑', alts: [pre + '姑母'], age: null };
    return {
      main: pre + '叔',
      alts: [pre + '叔父'],
      age: { when: '若我比他父亲年长', main: pre + '伯', alts: [pre + '伯父'] }
    };
  }

  /** 堂/表长辈（同上的单数形式） */
  function collateralUncle(tang, sex) {
    return collateralAuntOrUncle(tang, 1, sex);
  }

  /** 堂/表晚辈（带前缀的侄辈） */
  function collateralNephew(tang, deep, sex, maxAlts) {
    var pre = tang ? '堂侄' : '表侄';
    var f = sex === 'f';
    var lv = Math.min(Math.max(deep, 1), 3);
    var stem = lv === 1 ? pre : (lv === 2 ? pre + '孙' : pre + '曾孙');
    var list = f
      ? [stem + '女', stem]
      : [stem, stem + '儿'];
    return toTerm(list, maxAlts);
  }

  /** 父母 */
  function parentOf(sex) {
    return sex === 'f'
      ? { main: '母亲', alts: ['妈妈', '妈', '娘', '母'] }
      : { main: '父亲', alts: ['爸爸', '爸', '爹', '父'] };
  }

  /** 根据 base 词判断配偶的称谓 */
  function spouseOf(base, isWife) {
    if (/堂/.test(base)) {
      return isWife ? toTerm(INLAW.cousinWifeElder) : toTerm(INLAW.cousinHusbandElder);
    }
    if (/表/.test(base)) {
      return isWife ? toTerm(INLAW.biaoCousinWifeElder) : toTerm(INLAW.biaoCousinHusbandElder);
    }
    if (/姑母|姑姑|姑妈|姑$/.test(base)) {
      return isWife
        ? { main: '姑母', alts: ['姑姑', '姑妈'] }
        : toTerm(INLAW.uncleHusband);
    }
    if (/舅/.test(base)) {
      return isWife ? toTerm(INLAW.auntWife) : { main: '舅舅', alts: ['舅父', '舅'] };
    }
    if (/姨/.test(base)) {
      return isWife ? { main: '姨妈', alts: ['姨母', '姨'] } : toTerm(INLAW.auntHusband);
    }
    if (/伯|叔/.test(base)) {
      return isWife ? toTerm(INLAW.uncleWife) : { main: '伯父', alts: ['伯伯', '叔父', '叔叔'] };
    }
    if (/侄|甥/.test(base)) {
      return isWife ? toTerm(INLAW.nephewWife) : toTerm(INLAW.nephewHusband);
    }
    if (/哥哥|哥|弟弟|弟|姐姐|姐|妹妹|妹|兄|姊/.test(base)) {
      return isWife
        ? { main: '嫂子', alts: ['嫂嫂', '嫂', '大嫂'] }
        : toTerm(INLAW.sisterHusbandElder);
    }
    return null;
  }

  return {
    // 原始表
    DIRECT_UP: DIRECT_UP,
    DIRECT_DOWN: DIRECT_DOWN,
    COLLATERAL: COLLATERAL,
    COLLATERAL_DEEP: COLLATERAL_DEEP,
    NEPHEW: NEPHEW,
    PEER: PEER,
    INLAW: INLAW,

    // 取词函数
    directUp: directUp,
    directDown: directDown,
    collateral: collateral,
    nephew: nephew,
    peer: peer,
    toTerm: toTerm,
    inlaw: inlaw,

    // 「他称我」方向
    callsMe: callsMe,
    auntsChildCallsMe: auntsChildCallsMe,
    nephewCallsMe: nephewCallsMe,
    upDownCallsMe: upDownCallsMe,
    collateralAuntOrUncle: collateralAuntOrUncle,
    collateralNephew: collateralNephew,
    nephewNamesMe: nephewNamesMe,
    elderNamesMe: elderNamesMe,
    collateralUncle: collateralUncle,

    // 常量
    self: { main: '我', alts: [] },
    parentOf: parentOf,
    spouseOf: spouseOf,
    unknown: { main: '（关系无法识别）', alts: [] },
    partialUnknown: ['部分关系无法识别'],
    badPathHint: ['请改用更准确的描述'],
    detourHint: ['这种绕圈的描述有多种可能，建议直接用「祖父/外祖父」等关系'],
    tooDeepHint: ['辈分过深，一般直接叫名字'],
    complexHint: ['辈分关系复杂'],
    byGeneration: { main: '按辈分称呼', alts: [] }
  };
});
