/* 心头好 · 网页版主逻辑（单页应用）
   依赖 store.js 暴露的 Store / DateUtil / Img */
(function () {
  'use strict';

  var view = document.getElementById('view');
  var topbar = document.getElementById('topbar');
  var topTitle = document.getElementById('topTitle');
  var backBtn = document.getElementById('backBtn');
  var tabbar = document.getElementById('tabbar');
  var filePicker = document.getElementById('filePicker');

  // —— 路由栈：每项 {name, params} ——
  var stack = [{ name: 'frame', params: {} }];

  // 临时编辑态（建娃/加回忆用）
  var draft = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var TABS = ['frame', 'family', 'mine'];

  function current() { return stack[stack.length - 1]; }

  function go(name, params) {
    if (TABS.indexOf(name) >= 0) {
      stack = [{ name: name, params: params || {} }]; // tab 切换重置栈
    } else {
      stack.push({ name: name, params: params || {} });
    }
    render();
  }
  function back() {
    if (stack.length > 1) { stack.pop(); render(); }
  }

  // —— 选照片：返回 Promise<dataURL[]> ——
  function pickPhotos(multiple) {
    return new Promise(function (resolve) {
      filePicker.multiple = !!multiple;
      filePicker.value = '';
      filePicker.onchange = function () {
        var files = Array.prototype.slice.call(filePicker.files || []);
        if (!files.length) { resolve([]); return; }
        showToast('正在处理照片…');
        Promise.all(files.map(function (f) { return Img.compress(f, 1000); }))
          .then(function (arr) { resolve(arr); })
          .catch(function () { resolve([]); });
      };
      filePicker.click();
    });
  }

  // —— 轻提示 ——
  var toastTimer = null;
  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  /* ============ 渲染总控 ============ */
  function render() {
    var c = current();
    var isTab = TABS.indexOf(c.name) >= 0;
    // 顶栏：tab 页不显示返回
    backBtn.style.visibility = isTab ? 'hidden' : 'visible';
    tabbar.style.display = isTab ? 'flex' : 'none';
    document.body.classList.toggle('has-tab', isTab);

    var map = {
      frame: renderFrame, world: renderWorld, family: renderFamily, mine: renderMine,
      'doll-edit': renderDollEdit, 'memory-edit': renderMemoryEdit, 'memory-detail': renderMemoryDetail
    };
    (map[c.name] || renderFrame)(c.params);

    // 高亮当前 tab
    Array.prototype.forEach.call(tabbar.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('on', b.dataset.tab === c.name);
    });
    view.scrollTop = 0;
  }

  /* ============ 相框首页 ============ */
  function renderFrame() {
    topTitle.textContent = '心头好';
    var dolls = Store.getDolls().map(function (d) {
      return {
        id: d.id, name: d.name, coverPhoto: d.coverPhoto,
        daysText: d.homeDate ? '来家第 ' + DateUtil.daysTogether(d.homeDate) + ' 天' : ''
      };
    });

    if (!dolls.length) {
      view.innerHTML =
        '<div class="page frame-page">' +
          bgHtml() +
          '<div class="empty frame-empty">' +
            '<div class="frame frame-active frame-default"><div class="frame-inner">' +
              '<div class="frame-photo frame-photo-empty"><span class="default-heart">♡</span></div>' +
            '</div></div>' +
            '<div class="empty-tip">把你心头的它，请进来吧</div>' +
            '<button class="btn-primary add-first" style="margin-top:16px;width:180px;">请它进来</button>' +
          '</div>' +
        '</div>';
      view.querySelector('.add-first').onclick = function () { openDollEdit(); };
      return;
    }

    var activeId = Store.getActiveDollId();
    var idx = dolls.findIndex(function (d) { return d.id === activeId; });
    if (idx < 0) idx = 0;

    var slides = dolls.map(function (d) {
      return '<div class="frame-slide" data-id="' + d.id + '">' +
        '<div class="frame frame-active">' +
          '<div class="frame-inner">' +
            (d.coverPhoto
              ? '<img class="frame-photo" src="' + d.coverPhoto + '" />'
              : '<div class="frame-photo frame-photo-empty"><span class="faint">还没有照片</span></div>') +
          '</div>' +
        '</div></div>';
    }).join('');

    view.innerHTML =
      '<div class="page frame-page">' +
        bgHtml() +
        '<div class="frame-track" id="frameTrack">' + slides + '</div>' +
        '<div class="frame-caption">' +
          '<div class="frame-name" id="fName">' + esc(dolls[idx].name) + '</div>' +
          '<div class="frame-days" id="fDays">' + esc(dolls[idx].daysText) + '</div>' +
        '</div>' +
        '<div class="frame-hint faint">轻轻一点，走进它的世界</div>' +
      '</div>';

    var track = document.getElementById('frameTrack');
    // 定位到当前主角
    requestAnimationFrame(function () {
      var slide = track.children[idx];
      if (slide) track.scrollLeft = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
    });

    // 点击进入世界
    Array.prototype.forEach.call(track.children, function (el) {
      el.querySelector('.frame').onclick = function () {
        go('world', { id: el.dataset.id });
      };
    });

    // 滚动时更新名字/天数 + 记录主角
    var scrollTimer = null;
    track.onscroll = function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var center = track.scrollLeft + track.clientWidth / 2;
        var best = 0, bestDist = Infinity;
        Array.prototype.forEach.call(track.children, function (el, i) {
          var elCenter = el.offsetLeft + el.clientWidth / 2;
          var dist = Math.abs(elCenter - center);
          if (dist < bestDist) { bestDist = dist; best = i; }
        });
        document.getElementById('fName').textContent = dolls[best].name;
        document.getElementById('fDays').textContent = dolls[best].daysText;
        Store.setActiveDollId(dolls[best].id);
      }, 80);
    };
  }

  function bgHtml() {
    return '<div class="sky-bg"></div><div class="grass-bg"></div>' +
      '<div class="petals">' +
        petal(26, 'var(--flower-pink)', '12%', '14%', 0.55) +
        petal(18, 'var(--flower-white)', '84%', '10%', 0.8) +
        petal(22, 'var(--flower-blue)', '80%', '30%', 0.55) +
        petal(16, 'var(--flower-pink)', '8%', '38%', 0.55) +
        petal(20, 'var(--grass-soft)', '90%', '52%', 0.55) +
        petal(14, 'var(--flower-white)', '16%', '58%', 0.8) +
      '</div>';
  }
  function petal(size, color, left, top, op) {
    return '<span class="petal" style="width:' + (size / 2) + 'px;height:' + (size / 2) +
      'px;background:' + color + ';left:' + left + ';top:' + top + ';opacity:' + op + ';"></span>';
  }

  /* ============ 它的世界 ============ */
  function renderWorld(params) {
    var doll = Store.getDoll(params.id || Store.getActiveDollId());
    if (!doll) { showToast('它不见了'); back(); return; }
    topTitle.textContent = doll.name || '它的世界';

    var daysText = doll.homeDate ? '来家第 ' + DateUtil.daysTogether(doll.homeDate) + ' 天' : '';
    var specs = doll.specs || {};
    var specsList = Object.keys(specs).filter(function (k) { return specs[k]; })
      .map(function (k) { return { label: k, value: specs[k] }; });

    var moodMap = {};
    Store.getMoods().forEach(function (m) { moodMap[m.id] = m.label; });

    var memories = Store.getMemories(doll.id).map(function (m) {
      return {
        id: m.id, cover: (m.photos && m.photos[0]) || '', photoCount: (m.photos || []).length,
        text: m.text, dateText: DateUtil.friendlyDate(m.date),
        moodLabel: m.moodId ? (moodMap[m.moodId] || '') : ''
      };
    });

    var tagsHtml = (doll.personality || []).map(function (t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');

    var gridHtml = memories.length ? memories.map(function (m) {
      return '<div class="grid-cell" data-id="' + m.id + '">' +
        (m.cover
          ? '<img class="grid-photo" src="' + m.cover + '" />'
          : '<div class="grid-photo grid-photo-text"><span class="grid-text-only">' + esc(m.text) + '</span></div>') +
        (m.photoCount > 1 ? '<span class="grid-badge">' + m.photoCount + '</span>' : '') +
        '<div class="grid-meta"><span class="grid-date">' + esc(m.dateText) + '</span>' +
          (m.moodLabel ? '<span class="grid-mood">· ' + esc(m.moodLabel) + '</span>' : '') +
        '</div></div>';
    }).join('') :
      '<div class="empty"><div class="empty-tip">还没有你们的故事</div>' +
      '<div class="faint" style="margin-top:6px;">记下第一个和它在一起的瞬间吧</div></div>';

    view.innerHTML =
      '<div class="page world-page">' +
        '<div class="profile">' +
          '<div class="profile-photo-wrap">' +
            (doll.coverPhoto
              ? '<img class="profile-photo" src="' + doll.coverPhoto + '" />'
              : '<div class="profile-photo profile-photo-empty"><span class="faint">还没有照片</span></div>') +
            '<span class="edit-chip" id="editDoll">编辑档案</span>' +
          '</div>' +
          '<div class="profile-head"><span class="profile-name">' + esc(doll.name) + '</span>' +
            (doll.nickname ? '<span class="profile-nick">「' + esc(doll.nickname) + '」</span>' : '') + '</div>' +
          (daysText ? '<div class="profile-days">' + esc(daysText) + '</div>' : '') +
          (tagsHtml ? '<div class="profile-tags">' + tagsHtml + '</div>' : '') +
          (doll.meetStory ? '<div class="story card"><div class="story-title">我们的相遇</div>' +
            '<div class="story-text">' + esc(doll.meetStory) + '</div></div>' : '') +
          (specsList.length ? specsBlock(specsList) : '') +
        '</div>' +
        '<div class="divider"><span class="divider-text">你们的时间线</span></div>' +
        '<div class="grid">' + gridHtml + '</div>' +
        '<div class="bottom-safe"></div>' +
        '<button class="fab" id="addMem">＋</button>' +
      '</div>';

    view.querySelector('#editDoll').onclick = function () { openDollEdit(doll.id); };
    view.querySelector('#addMem').onclick = function () {
      draft = {}; go('memory-edit', { dollId: doll.id });
    };
    var sb = view.querySelector('#specsToggle');
    if (sb) sb.onclick = function () {
      var body = view.querySelector('#specsBody');
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      sb.querySelector('.specs-arrow').textContent = open ? '展开 ▾' : '收起 ▴';
    };
    Array.prototype.forEach.call(view.querySelectorAll('.grid-cell'), function (el) {
      el.onclick = function () { go('memory-detail', { id: el.dataset.id }); };
    });
  }
  function specsBlock(list) {
    var rows = list.map(function (s) {
      return '<div class="specs-row"><span class="specs-label muted">' + esc(s.label) +
        '</span><span class="specs-value">' + esc(s.value) + '</span></div>';
    }).join('');
    return '<div class="specs">' +
      '<div class="specs-toggle" id="specsToggle"><span>规格参数</span><span class="specs-arrow">展开 ▾</span></div>' +
      '<div class="specs-body card" id="specsBody" style="display:none;">' + rows + '</div></div>';
  }

  /* ============ 家族 ============ */
  function renderFamily() {
    topTitle.textContent = '家族';
    var activeId = Store.getActiveDollId();
    var dolls = Store.getDolls().map(function (d) {
      return {
        id: d.id, name: d.name, coverPhoto: d.coverPhoto,
        daysText: d.homeDate ? '第 ' + DateUtil.daysTogether(d.homeDate) + ' 天' : '',
        memCount: Store.countMemories(d.id)
      };
    });

    if (!dolls.length) {
      view.innerHTML = '<div class="page family-page"><div class="empty">' +
        '<span class="default-heart" style="font-size:50px;color:var(--peach);">♡</span>' +
        '<div class="empty-tip">还没有家庭成员</div>' +
        '<button class="btn-primary" id="addFirst" style="margin-top:24px;width:180px;">请它进来</button>' +
        '</div></div>';
      view.querySelector('#addFirst').onclick = function () { openDollEdit(); };
      return;
    }

    var cards = dolls.map(function (d) {
      return '<div class="family-card' + (d.id === activeId ? ' family-card-active' : '') + '" data-id="' + d.id + '">' +
        '<div class="family-photo-wrap">' +
          (d.coverPhoto
            ? '<img class="family-photo" src="' + d.coverPhoto + '" />'
            : '<div class="family-photo family-photo-empty"><span class="faint">♡</span></div>') +
          (d.id === activeId ? '<span class="active-badge">今日主角</span>' : '') +
        '</div>' +
        '<div class="family-name">' + esc(d.name) + '</div>' +
        '<div class="family-meta faint">' + esc(d.daysText) +
          (d.memCount ? ' · ' + d.memCount + ' 个瞬间' : '') + '</div>' +
        '<div class="family-enter" data-enter="' + d.id + '">进它的世界 ›</div>' +
      '</div>';
    }).join('');

    view.innerHTML =
      '<div class="page family-page">' +
        '<div class="family-head"><div class="family-title">我的全家福</div>' +
          '<div class="family-sub faint">点一下，让它当今天的主角</div></div>' +
        '<div class="family-grid">' + cards +
          '<div class="family-card family-add" id="addDoll">' +
            '<span class="family-add-plus">＋</span><span class="faint">请新成员进来</span></div>' +
        '</div><div class="bottom-safe"></div>' +
      '</div>';

    view.querySelector('#addDoll').onclick = function () { openDollEdit(); };
    Array.prototype.forEach.call(view.querySelectorAll('.family-card[data-id]'), function (el) {
      el.onclick = function (e) {
        if (e.target.dataset.enter) { go('world', { id: e.target.dataset.enter }); return; }
        Store.setActiveDollId(el.dataset.id);
        go('frame', {});
      };
    });
  }

  /* ============ 我的 ============ */
  function renderMine() {
    topTitle.textContent = '我的';
    var dolls = Store.getDolls();
    var memCount = 0;
    dolls.forEach(function (d) { memCount += Store.countMemories(d.id); });
    var soon = [
      ['🖼', '导出分享', '把档案卡、时间线做成精美图片发出去'],
      ['🔔', '纪念日提醒', '生日、来家纪念日到了轻轻提醒你'],
      ['🌸', '回忆重逢', '“去年今天”，旧照片主动回来找你'],
      ['📖', '成长章节', '回忆自动归类成初遇、第一个春天…'],
      ['💗', '心情轨迹', '看你们一路走来的情绪曲线']
    ];
    var soonHtml = soon.map(function (s) {
      return '<div class="soon-item card"><span class="soon-icon">' + s[0] + '</span>' +
        '<div class="soon-text"><div class="soon-name">' + s[1] + '</div>' +
        '<div class="soon-desc faint">' + s[2] + '</div></div><span class="soon-flag">soon</span></div>';
    }).join('');

    view.innerHTML =
      '<div class="page mine-page">' +
        '<div class="mine-head"><div class="mine-slogan">你是我心头最软的地方</div>' +
          '<div class="mine-stat">' +
            '<div class="stat-item"><span class="stat-num">' + dolls.length + '</span><span class="stat-label faint">个心头好</span></div>' +
            '<div class="stat-divider"></div>' +
            '<div class="stat-item"><span class="stat-num">' + memCount + '</span><span class="stat-label faint">个瞬间</span></div>' +
          '</div></div>' +
        '<div class="soon-title muted">正在慢慢做，敬请期待</div>' +
        '<div class="soon-list">' + soonHtml + '</div>' +
        '<div class="mine-foot faint">心头好 · 把珍惜好好收起来</div>' +
        '<div class="bottom-safe"></div>' +
      '</div>';
  }

  /* ============ 建娃 / 编辑 ============ */
  function openDollEdit(id) {
    var GEN = ['不设定', '男孩子', '女孩子', '其他'];
    if (id) {
      var d = Store.getDoll(id);
      var sp = d.specs || {};
      draft = {
        id: d.id, isEdit: true, coverPhoto: d.coverPhoto || '', name: d.name || '',
        nickname: d.nickname || '', homeDate: d.homeDate || DateUtil.today(), birthday: d.birthday || '',
        gender: d.gender || '不设定', personality: (d.personality || []).slice(), meetStory: d.meetStory || '',
        specSeries: sp['社/系列'] || '', specBody: sp['体型'] || '', specAccessory: sp['配件'] || ''
      };
    } else {
      draft = {
        isEdit: false, coverPhoto: '', name: '', nickname: '', homeDate: DateUtil.today(),
        birthday: '', gender: '不设定', personality: [], meetStory: '',
        specSeries: '', specBody: '', specAccessory: ''
      };
    }
    draft.GEN = GEN;
    go('doll-edit', {});
  }

  function renderDollEdit() {
    topTitle.textContent = draft.isEdit ? '编辑档案' : '建一个档案';
    var d = draft;
    var tags = d.personality.map(function (t, i) {
      return '<span class="tag tag-edit" data-i="' + i + '">' + esc(t) + ' <span class="tag-x">×</span></span>';
    }).join('');
    var genOpts = d.GEN.map(function (g) {
      return '<option value="' + g + '"' + (g === d.gender ? ' selected' : '') + '>' + g + '</option>';
    }).join('');

    view.innerHTML =
      '<div class="page doll-edit">' +
        '<div class="cover-wrap" id="coverWrap">' +
          (d.coverPhoto
            ? '<img class="cover-img" src="' + d.coverPhoto + '" /><span class="cover-change">换一张</span>'
            : '<div class="cover-empty"><span class="cover-plus">＋</span><span class="faint">挑一张它的照片</span></div>') +
        '</div>' +
        field('它叫什么', '<input class="field-input" id="f_name" placeholder="给它一个名字" value="' + esc(d.name) + '" />') +
        field('小名 / 昵称', '<input class="field-input" id="f_nick" placeholder="平时怎么叫它（选填）" value="' + esc(d.nickname) + '" />') +
        field('哪天来家的', '<input class="field-input" type="date" id="f_home" max="' + DateUtil.today() + '" value="' + esc(d.homeDate) + '" />') +
        field('生日设定', '<input class="field-input" type="date" id="f_birth" value="' + esc(d.birthday) + '" />') +
        field('性别设定', '<select class="field-input" id="f_gender">' + genOpts + '</select>') +
        '<div class="field field-col"><span class="field-label">它是个怎样的性格</span>' +
          '<div class="tags-edit" id="tagsBox">' + tags + '</div>' +
          '<div class="tag-add-row"><input class="field-input tag-add-input" id="f_tag" placeholder="温柔 / 爱睡 / 怕黑…" />' +
          '<span class="tag-add-btn" id="addTag">加上</span></div></div>' +
        '<div class="field field-col"><span class="field-label">我们的相遇</span>' +
          '<textarea class="field-textarea" id="f_story" placeholder="它是怎么来到你身边的？当时的心情…（选填）">' + esc(d.meetStory) + '</textarea></div>' +
        '<div class="specs-edit"><div class="specs-edit-title muted">规格参数（都可不填）</div>' +
          field('社 / 系列', '<input class="field-input" id="f_series" placeholder="选填" value="' + esc(d.specSeries) + '" />') +
          field('体型', '<input class="field-input" id="f_body" placeholder="选填" value="' + esc(d.specBody) + '" />') +
          field('配件', '<input class="field-input" id="f_acc" placeholder="选填" value="' + esc(d.specAccessory) + '" />') +
        '</div>' +
        '<button class="btn-primary save-btn" id="saveDoll">' + (d.isEdit ? '保存' : '请它进来') + '</button>' +
        (d.isEdit ? '<div class="del-doll" id="delDoll">和它告别</div>' : '') +
        '<div class="bottom-safe"></div>' +
      '</div>';

    // 同步输入到 draft
    bindInput('f_name', 'name'); bindInput('f_nick', 'nickname');
    bindInput('f_home', 'homeDate'); bindInput('f_birth', 'birthday');
    bindInput('f_story', 'meetStory'); bindInput('f_series', 'specSeries');
    bindInput('f_body', 'specBody'); bindInput('f_acc', 'specAccessory');
    view.querySelector('#f_gender').onchange = function () { draft.gender = this.value; };

    view.querySelector('#coverWrap').onclick = function () {
      pickPhotos(false).then(function (arr) {
        if (arr[0]) { draft.coverPhoto = arr[0]; renderDollEdit(); }
      });
    };
    view.querySelector('#addTag').onclick = addTag;
    view.querySelector('#f_tag').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addTag(); } };
    Array.prototype.forEach.call(view.querySelectorAll('.tag-edit'), function (el) {
      el.onclick = function () { draft.personality.splice(+el.dataset.i, 1); renderDollEdit(); };
    });
    view.querySelector('#saveDoll').onclick = saveDoll;
    var del = view.querySelector('#delDoll');
    if (del) del.onclick = function () {
      if (confirm('和 ' + draft.name + ' 告别？\n它的档案和你们所有的回忆都会被删掉，且找不回来。')) {
        Store.deleteDoll(draft.id);
        showToast('已删除');
        go('frame', {});
      }
    };

    function addTag() {
      var inp = view.querySelector('#f_tag');
      var w = (inp.value || '').trim();
      if (!w) return;
      if (draft.personality.indexOf(w) < 0) draft.personality.push(w);
      inp.value = '';
      renderDollEdit();
      setTimeout(function () { var n = view.querySelector('#f_tag'); if (n) n.focus(); }, 0);
    }
  }

  function bindInput(elId, key) {
    var el = view.querySelector('#' + elId);
    if (el) el.oninput = function () { draft[key] = this.value; };
  }

  function saveDoll() {
    var name = (draft.name || '').trim();
    if (!name) { showToast('先给它起个名字吧'); return; }
    if (!draft.coverPhoto) { showToast('挑一张它的照片吧'); return; }
    if (!draft.homeDate) { showToast('它哪天来家的呢'); return; }
    var specs = {};
    if (draft.specSeries) specs['社/系列'] = draft.specSeries;
    if (draft.specBody) specs['体型'] = draft.specBody;
    if (draft.specAccessory) specs['配件'] = draft.specAccessory;
    var payload = {
      name: name, nickname: (draft.nickname || '').trim(), coverPhoto: draft.coverPhoto,
      homeDate: draft.homeDate, birthday: draft.birthday,
      gender: draft.gender === '不设定' ? '' : draft.gender,
      personality: draft.personality, meetStory: (draft.meetStory || '').trim(), specs: specs
    };
    if (draft.isEdit) {
      Store.updateDoll(draft.id, payload);
    } else {
      var nd = Store.addDoll(payload);
      Store.setActiveDollId(nd.id);
    }
    showToast('存好了');
    back();
  }

  /* ============ 加回忆 ============ */
  function renderMemoryEdit(params) {
    topTitle.textContent = '记一条';
    if (!draft.__mem) {
      draft.__mem = { dollId: params.dollId || Store.getActiveDollId(), photos: [], text: '', date: DateUtil.today(), moodId: '' };
    }
    var m = draft.__mem;
    var moods = Store.getMoods();
    var photoItems = m.photos.map(function (p, i) {
      return '<div class="photo-item"><img class="photo-img" src="' + p + '" data-i="' + i + '" />' +
        '<span class="photo-del" data-del="' + i + '">×</span></div>';
    }).join('');
    var moodChips = moods.map(function (mo) {
      return '<span class="mood-chip' + (m.moodId === mo.id ? ' mood-chip-on' : '') + '" data-mood="' + mo.id + '">' + esc(mo.label) + '</span>';
    }).join('');

    view.innerHTML =
      '<div class="page mem-edit">' +
        '<div class="section"><div class="photo-grid">' + photoItems +
          (m.photos.length < 9 ? '<div class="photo-add" id="addPhoto"><span class="photo-add-plus">＋</span><span class="photo-add-tip faint">加张照片</span></div>' : '') +
        '</div></div>' +
        '<div class="section"><textarea class="mem-text" id="memText" placeholder="今天和它之间，发生了什么？">' + esc(m.text) + '</textarea></div>' +
        '<div class="section row-line"><span class="row-label">发生在</span>' +
          '<input class="row-date" type="date" id="memDate" max="' + DateUtil.today() + '" value="' + esc(m.date) + '" /></div>' +
        '<div class="section"><div class="row-label" style="margin-bottom:10px;">此刻的心情</div>' +
          '<div class="mood-list" id="moodList">' + moodChips +
            '<span class="mood-chip mood-chip-new" id="newMood">＋ 新心情</span></div></div>' +
        '<div class="section"><button class="btn-primary" id="saveMem">记下来</button></div>' +
        '<div class="bottom-safe"></div>' +
      '</div>';

    view.querySelector('#memText').oninput = function () { m.text = this.value; };
    view.querySelector('#memDate').onchange = function () { m.date = this.value; };
    var addP = view.querySelector('#addPhoto');
    if (addP) addP.onclick = function () {
      pickPhotos(true).then(function (arr) {
        if (arr.length) { m.photos = m.photos.concat(arr).slice(0, 9); renderMemoryEdit(params); }
      });
    };
    Array.prototype.forEach.call(view.querySelectorAll('.photo-del'), function (el) {
      el.onclick = function () { m.photos.splice(+el.dataset.del, 1); renderMemoryEdit(params); };
    });
    Array.prototype.forEach.call(view.querySelectorAll('.mood-chip[data-mood]'), function (el) {
      el.onclick = function () { m.moodId = (m.moodId === el.dataset.mood) ? '' : el.dataset.mood; renderMemoryEdit(params); };
    });
    view.querySelector('#newMood').onclick = function () { openMoodPanel(params); };
    view.querySelector('#saveMem').onclick = function () {
      var text = (m.text || '').trim();
      if (!m.photos.length && !text) { showToast('写点什么，或加张照片'); return; }
      var saved = Store.addMemory({ dollId: m.dollId, photos: m.photos, text: text, date: m.date, moodId: m.moodId });
      if (!saved) return;
      draft.__mem = null;
      showToast('记下了');
      back();
    };
  }

  function openMoodPanel(params) {
    var WARMTH = ['暖', '平', '涩'];
    var picked = '平';
    var mask = document.createElement('div');
    mask.className = 'mask';
    mask.innerHTML =
      '<div class="mood-panel" id="mp">' +
        '<div class="mood-panel-title">给这份心情起个名字</div>' +
        '<input class="mood-input" id="moodInput" placeholder="比如 被治愈了 / 想它" />' +
        '<div class="mood-panel-sub faint">它大概是哪种感觉？（只问这一次）</div>' +
        '<div class="warmth-list" id="warmthList">' +
          WARMTH.map(function (w) { return '<span class="warmth-item' + (w === '平' ? ' warmth-on' : '') + '" data-w="' + w + '">' + w + '</span>'; }).join('') +
        '</div>' +
        '<div class="mood-panel-btns"><span class="btn-ghost mood-panel-btn" id="mpCancel">取消</span>' +
          '<span class="btn-primary mood-panel-btn" id="mpOk">就叫它</span></div>' +
      '</div>';
    document.body.appendChild(mask);
    var input = mask.querySelector('#moodInput');
    setTimeout(function () { input.focus(); }, 50);
    mask.onclick = function (e) { if (e.target === mask) document.body.removeChild(mask); };
    mask.querySelector('#mp').onclick = function (e) { e.stopPropagation(); };
    Array.prototype.forEach.call(mask.querySelectorAll('.warmth-item'), function (el) {
      el.onclick = function () {
        picked = el.dataset.w;
        Array.prototype.forEach.call(mask.querySelectorAll('.warmth-item'), function (x) { x.classList.remove('warmth-on'); });
        el.classList.add('warmth-on');
      };
    });
    mask.querySelector('#mpCancel').onclick = function () { document.body.removeChild(mask); };
    mask.querySelector('#mpOk').onclick = function () {
      var label = (input.value || '').trim();
      if (!label) { showToast('写一个心情词吧'); return; }
      var mood = Store.addMood(label, picked);
      draft.__mem.moodId = mood.id;
      document.body.removeChild(mask);
      renderMemoryEdit(params);
    };
  }

  /* ============ 回忆详情 ============ */
  function renderMemoryDetail(params) {
    topTitle.textContent = '这一刻';
    var mem = Store.getMemory(params.id);
    if (!mem) { showToast('这条不见了'); back(); return; }
    var moodLabel = '';
    if (mem.moodId) { var mo = Store.getMood(mem.moodId); moodLabel = mo ? mo.label : ''; }
    var photos = (mem.photos || []).map(function (p, i) {
      return '<img class="detail-photo" src="' + p + '" data-i="' + i + '" />';
    }).join('');

    view.innerHTML =
      '<div class="page mem-detail">' +
        (photos ? '<div class="detail-photos">' + photos + '</div>' : '') +
        '<div class="detail-meta"><span class="detail-date">' + esc(DateUtil.friendlyDate(mem.date)) + '</span>' +
          (moodLabel ? '<span class="detail-mood">' + esc(moodLabel) + '</span>' : '') + '</div>' +
        (mem.text ? '<div class="detail-text">' + esc(mem.text) + '</div>' : '') +
        '<div class="detail-del" id="delMem">删掉这一刻</div>' +
        '<div class="bottom-safe"></div>' +
      '</div>';

    Array.prototype.forEach.call(view.querySelectorAll('.detail-photo'), function (el) {
      el.onclick = function () { window.open(el.src, '_blank'); };
    });
    view.querySelector('#delMem').onclick = function () {
      if (confirm('删掉这一刻？\n删除后就找不回来了。')) {
        Store.deleteMemory(params.id);
        showToast('已删除');
        back();
      }
    };
  }

  // —— field 小模板 ——
  function field(label, inner) {
    return '<div class="field"><span class="field-label">' + label + '</span>' + inner + '</div>';
  }

  /* ============ 全局事件 ============ */
  backBtn.onclick = back;
  Array.prototype.forEach.call(tabbar.querySelectorAll('.tab'), function (b) {
    b.onclick = function () { go(b.dataset.tab, {}); };
  });
  // 安卓返回键 / 浏览器后退
  window.addEventListener('popstate', function () { if (stack.length > 1) back(); });

  render();
})();
