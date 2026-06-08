/* 心头好 · 网页版数据层（localStorage + Supabase 双后端）
   登录后使用 Supabase，未登录时降级为 localStorage。
   所有 Store 方法均为 async，调用方统一 await。 */

(function () {
  'use strict';

  var KEY_DOLLS = 'xth_dolls';
  var KEY_MEMORIES = 'xth_memories';
  var KEY_MOODS = 'xth_moods';
  var KEY_ACTIVE = 'xth_activeDollId';

  // —— 当前用户 ——
  var _user = null; // { id: 'uuid', email: '...' }

  // ========== localStorage 后端（降级用） ==========

  function localRead(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }
  function localWrite(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      alert('存储空间快满啦，照片太多会存不下～可以删掉一些旧回忆');
      return false;
    }
  }
  function genId() {
    return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  // ---------- local: 娃 ----------
  function localGetDolls() {
    return localRead(KEY_DOLLS).slice().sort(function (a, b) {
      if (a.order !== b.order) return (a.order || 0) - (b.order || 0);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }
  function localGetDoll(id) {
    return localRead(KEY_DOLLS).find(function (d) { return d.id === id; }) || null;
  }
  function localAddDoll(data) {
    var dolls = localRead(KEY_DOLLS);
    var doll = {
      id: genId(),
      name: data.name || '',
      nickname: data.nickname || '',
      coverPhoto: data.coverPhoto || '',
      homeDate: data.homeDate || '',
      birthday: data.birthday || '',
      gender: data.gender || '',
      personality: data.personality || [],
      meetStory: data.meetStory || '',
      specs: data.specs || {},
      order: dolls.length,
      createdAt: Date.now()
    };
    dolls.push(doll);
    localWrite(KEY_DOLLS, dolls);
    if (!localGetActiveDollId()) localSetActiveDollId(doll.id);
    return doll;
  }
  function localUpdateDoll(id, patch) {
    var dolls = localRead(KEY_DOLLS);
    var idx = dolls.findIndex(function (d) { return d.id === id; });
    if (idx === -1) return null;
    dolls[idx] = Object.assign({}, dolls[idx], patch);
    localWrite(KEY_DOLLS, dolls);
    return dolls[idx];
  }
  function localDeleteDoll(id) {
    localWrite(KEY_DOLLS, localRead(KEY_DOLLS).filter(function (d) { return d.id !== id; }));
    localWrite(KEY_MEMORIES, localRead(KEY_MEMORIES).filter(function (m) { return m.dollId !== id; }));
    if (localGetActiveDollId() === id) {
      var left = localGetDolls();
      localSetActiveDollId(left.length ? left[0].id : '');
    }
  }

  // ---------- local: 主角 ----------
  function localGetActiveDollId() {
    return localStorage.getItem(KEY_ACTIVE) || '';
  }
  function localSetActiveDollId(id) {
    localStorage.setItem(KEY_ACTIVE, id || '');
  }

  // ---------- local: 回忆 ----------
  function localGetMemories(dollId) {
    return localRead(KEY_MEMORIES)
      .filter(function (m) { return m.dollId === dollId; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }
  function localGetMemory(id) {
    return localRead(KEY_MEMORIES).find(function (m) { return m.id === id; }) || null;
  }
  function localAddMemory(data) {
    var memories = localRead(KEY_MEMORIES);
    var memory = {
      id: genId(),
      dollId: data.dollId,
      photos: data.photos || [],
      text: data.text || '',
      date: data.date || '',
      moodId: data.moodId || '',
      createdAt: Date.now()
    };
    memories.push(memory);
    if (!localWrite(KEY_MEMORIES, memories)) return null;
    return memory;
  }
  function localDeleteMemory(id) {
    localWrite(KEY_MEMORIES, localRead(KEY_MEMORIES).filter(function (m) { return m.id !== id; }));
  }
  function localCountMemories(dollId) {
    return localRead(KEY_MEMORIES).filter(function (m) { return m.dollId === dollId; }).length;
  }

  // ---------- local: 心情库 ----------
  function localGetMoods() { return localRead(KEY_MOODS); }
  function localGetMood(id) {
    return localRead(KEY_MOODS).find(function (m) { return m.id === id; }) || null;
  }
  function localAddMood(label, warmth) {
    var moods = localRead(KEY_MOODS);
    var exist = moods.find(function (m) { return m.label === label; });
    if (exist) return exist;
    var mood = { id: genId(), label: label, warmth: warmth || '平' };
    moods.push(mood);
    localWrite(KEY_MOODS, moods);
    return mood;
  }

  // ========== Supabase 后端 ==========

  // 把云端的 snake_case 行转为驼峰（与 localStorage 格式对齐）
  function dollFromRow(r) {
    return {
      id: r.id,
      name: r.name,
      nickname: r.nickname || '',
      coverPhoto: r.cover_photo || '',
      homeDate: r.home_date || '',
      birthday: r.birthday || '',
      gender: r.gender || '',
      personality: r.personality || [],
      meetStory: r.meet_story || '',
      specs: r.specs || {},
      order: r.sort_order || 0,
      createdAt: r.created_at || 0
    };
  }
  function dollToRow(d) {
    return {
      id: d.id,
      user_id: _user.id,
      name: d.name,
      nickname: d.nickname || '',
      cover_photo: d.coverPhoto || '',
      home_date: d.homeDate || '',
      birthday: d.birthday || '',
      gender: d.gender || '',
      personality: d.personality || [],
      meet_story: d.meetStory || '',
      specs: d.specs || {},
      sort_order: d.order || 0,
      created_at: d.createdAt || Date.now()
    };
  }

  function memoryFromRow(r) {
    return {
      id: r.id,
      dollId: r.doll_id,
      photos: r.photos || [],
      text: r.text || '',
      date: r.date || '',
      moodId: r.mood_id || '',
      createdAt: r.created_at || 0
    };
  }
  function memoryToRow(m) {
    return {
      id: m.id,
      user_id: _user.id,
      doll_id: m.dollId,
      photos: m.photos || [],
      text: m.text || '',
      date: m.date || '',
      mood_id: m.moodId || '',
      created_at: m.createdAt || Date.now()
    };
  }

  function moodFromRow(r) {
    return { id: r.id, label: r.label, warmth: r.warmth || '平' };
  }
  function moodToRow(m) {
    return { id: m.id, user_id: _user.id, label: m.label, warmth: m.warmth || '平' };
  }

  var TBL = { dolls: 'dolls', memories: 'memories', moods: 'moods', settings: 'user_settings' };

  // ---------- cloud: 娃 ----------
  async function cloudGetDolls() {
    var res = await supabase.from(TBL.dolls).select('*').order('sort_order').order('created_at');
    if (res.error) { console.error(res.error); return []; }
    return (res.data || []).map(dollFromRow);
  }
  async function cloudGetDoll(id) {
    var res = await supabase.from(TBL.dolls).select('*').eq('id', id).maybeSingle();
    if (res.error || !res.data) return null;
    return dollFromRow(res.data);
  }
  async function cloudAddDoll(data) {
    var doll = {
      id: genId(),
      name: data.name || '',
      nickname: data.nickname || '',
      coverPhoto: data.coverPhoto || '',
      homeDate: data.homeDate || '',
      birthday: data.birthday || '',
      gender: data.gender || '',
      personality: data.personality || [],
      meetStory: data.meetStory || '',
      specs: data.specs || {},
      order: 0,
      createdAt: Date.now()
    };
    var res = await supabase.from(TBL.dolls).insert(dollToRow(doll));
    if (res.error) { console.error(res.error); return null; }
    // 第一个娃自动设为主角
    var active = await cloudGetActiveDollId();
    if (!active) await cloudSetActiveDollId(doll.id);
    return doll;
  }
  async function cloudUpdateDoll(id, patch) {
    var row = dollToRow(patch);
    var res = await supabase.from(TBL.dolls).update(row).eq('id', id).select().maybeSingle();
    if (res.error || !res.data) return null;
    return dollFromRow(res.data);
  }
  async function cloudDeleteDoll(id) {
    // 级联删回忆
    await supabase.from(TBL.memories).delete().eq('doll_id', id);
    await supabase.from(TBL.dolls).delete().eq('id', id);
    var active = await cloudGetActiveDollId();
    if (active === id) {
      var left = await cloudGetDolls();
      await cloudSetActiveDollId(left.length ? left[0].id : '');
    }
  }

  // ---------- cloud: 主角 ----------
  async function cloudGetActiveDollId() {
    var res = await supabase.from(TBL.settings).select('active_doll_id').maybeSingle();
    if (res.error || !res.data) return '';
    return res.data.active_doll_id || '';
  }
  async function cloudSetActiveDollId(id) {
    await supabase.from(TBL.settings).upsert({ user_id: _user.id, active_doll_id: id || '' });
  }

  // ---------- cloud: 回忆 ----------
  async function cloudGetMemories(dollId) {
    var res = await supabase.from(TBL.memories).select('*')
      .eq('doll_id', dollId).order('date', { ascending: false }).order('created_at', { ascending: false });
    if (res.error) { console.error(res.error); return []; }
    return (res.data || []).map(memoryFromRow);
  }
  async function cloudGetMemory(id) {
    var res = await supabase.from(TBL.memories).select('*').eq('id', id).maybeSingle();
    if (res.error || !res.data) return null;
    return memoryFromRow(res.data);
  }
  async function cloudAddMemory(data) {
    var memory = {
      id: genId(),
      dollId: data.dollId,
      photos: data.photos || [],
      text: data.text || '',
      date: data.date || '',
      moodId: data.moodId || '',
      createdAt: Date.now()
    };
    var res = await supabase.from(TBL.memories).insert(memoryToRow(memory));
    if (res.error) { console.error(res.error); return null; }
    return memory;
  }
  async function cloudDeleteMemory(id) {
    await supabase.from(TBL.memories).delete().eq('id', id);
  }
  async function cloudCountMemories(dollId) {
    var res = await supabase.from(TBL.memories).select('id', { count: 'exact' }).eq('doll_id', dollId);
    if (res.error) return 0;
    return res.count || 0;
  }

  // ---------- cloud: 心情库 ----------
  async function cloudGetMoods() {
    var res = await supabase.from(TBL.moods).select('*');
    if (res.error) { console.error(res.error); return []; }
    return (res.data || []).map(moodFromRow);
  }
  async function cloudGetMood(id) {
    var res = await supabase.from(TBL.moods).select('*').eq('id', id).maybeSingle();
    if (res.error || !res.data) return null;
    return moodFromRow(res.data);
  }
  async function cloudAddMood(label, warmth) {
    // 去重
    var exist = await supabase.from(TBL.moods).select('*').eq('label', label).maybeSingle();
    if (exist.data) return moodFromRow(exist.data);
    var mood = { id: genId(), label: label, warmth: warmth || '平' };
    var res = await supabase.from(TBL.moods).insert(moodToRow(mood)).select().maybeSingle();
    if (res.error || !res.data) return null;
    return moodFromRow(res.data);
  }

  // ========== 导出的统一接口 ==========

  var Store = {
    // —— 用户状态 ——
    get user() { return _user; },
    isLoggedIn: function () { return !!_user; },

    // —— 认证 ——
    init: async function () {
      var res = await supabase.auth.getSession();
      if (res.data && res.data.session) {
        _user = { id: res.data.session.user.id, email: res.data.session.user.email };
      }
      return _user;
    },

    signUp: async function (email, password) {
      var res = await supabase.auth.signUp({ email: email, password: password });
      if (res.error) return { error: res.error.message };
      // Supabase 可能要求邮箱验证，如果不需要验证则直接登录
      if (res.data.user) {
        _user = { id: res.data.user.id, email: res.data.user.email };
        // 初始化 user_settings
        await supabase.from(TBL.settings).upsert({ user_id: _user.id, active_doll_id: '' });
        return { user: _user };
      }
      return { error: '请检查邮箱完成验证' };
    },

    signIn: async function (email, password) {
      var res = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (res.error) {
        var msg = res.error.message;
        if (msg.indexOf('Invalid login') >= 0) msg = '邮箱或密码不正确';
        else if (msg.indexOf('Email not confirmed') >= 0) msg = '请先验证邮箱';
        return { error: msg };
      }
      _user = { id: res.data.user.id, email: res.data.user.email };
      return { user: _user };
    },

    signOut: async function () {
      await supabase.auth.signOut();
      _user = null;
    },

    // —— 娃 Doll ——
    getDolls: async function () {
      if (_user) return cloudGetDolls();
      return Promise.resolve(localGetDolls());
    },
    getDoll: async function (id) {
      if (_user) return cloudGetDoll(id);
      return Promise.resolve(localGetDoll(id));
    },
    addDoll: async function (data) {
      if (_user) return cloudAddDoll(data);
      return Promise.resolve(localAddDoll(data));
    },
    updateDoll: async function (id, patch) {
      if (_user) return cloudUpdateDoll(id, patch);
      return Promise.resolve(localUpdateDoll(id, patch));
    },
    deleteDoll: async function (id) {
      if (_user) { await cloudDeleteDoll(id); return; }
      localDeleteDoll(id);
    },

    // —— 当前主角 ——
    getActiveDollId: async function () {
      if (_user) return cloudGetActiveDollId();
      return Promise.resolve(localGetActiveDollId());
    },
    setActiveDollId: async function (id) {
      if (_user) { await cloudSetActiveDollId(id); return; }
      localSetActiveDollId(id);
    },

    // —— 回忆 Memory ——
    getMemories: async function (dollId) {
      if (_user) return cloudGetMemories(dollId);
      return Promise.resolve(localGetMemories(dollId));
    },
    getMemory: async function (id) {
      if (_user) return cloudGetMemory(id);
      return Promise.resolve(localGetMemory(id));
    },
    addMemory: async function (data) {
      if (_user) return cloudAddMemory(data);
      return Promise.resolve(localAddMemory(data));
    },
    deleteMemory: async function (id) {
      if (_user) { await cloudDeleteMemory(id); return; }
      localDeleteMemory(id);
    },
    countMemories: async function (dollId) {
      if (_user) return cloudCountMemories(dollId);
      return Promise.resolve(localCountMemories(dollId));
    },

    // —— 心情库 Mood ——
    getMoods: async function () {
      if (_user) return cloudGetMoods();
      return Promise.resolve(localGetMoods());
    },
    getMood: async function (id) {
      if (_user) return cloudGetMood(id);
      return Promise.resolve(localGetMood(id));
    },
    addMood: async function (label, warmth) {
      if (_user) return cloudAddMood(label, warmth);
      return Promise.resolve(localAddMood(label, warmth));
    }
  };

  // ========== 日期工具（不变） ==========
  function toDateStr(d) {
    if (!d) return '';
    if (typeof d === 'string') return d.slice(0, 10);
    var date = new Date(d);
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function today() { return toDateStr(new Date()); }
  function parseDay(str) {
    if (!str) return null;
    var p = str.slice(0, 10).split('-').map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }
  function daysTogether(homeDate) {
    var start = parseDay(toDateStr(homeDate));
    if (!start) return 0;
    var now = parseDay(today());
    return Math.floor((now - start) / 86400000) + 1;
  }
  function friendlyDate(dateStr) {
    var target = parseDay(toDateStr(dateStr));
    if (!target) return '';
    var now = parseDay(today());
    var diff = Math.floor((now - target) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    var m = target.getMonth() + 1;
    var d = target.getDate();
    var y = target.getFullYear();
    if (y === now.getFullYear()) return m + '月' + d + '日';
    return y + '年' + m + '月' + d + '日';
  }

  // ========== 图片压缩（不变） ==========
  function compressImage(file, maxSize) {
    maxSize = maxSize || 1000;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
          else if (h >= w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          } catch (err) {
            resolve(e.target.result);
          }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.Store = Store;
  window.DateUtil = { toDateStr: toDateStr, today: today, daysTogether: daysTogether, friendlyDate: friendlyDate };
  window.Img = { compress: compressImage };
})();
