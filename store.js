/* 心头好 · 网页版数据层（localStorage）
   对齐小程序的 store.js / date.js，外加浏览器图片压缩。
   纯全局脚本，挂在 window 上：Store / DateUtil / Img */
(function () {
  'use strict';

  var KEY_DOLLS = 'xth_dolls';
  var KEY_MEMORIES = 'xth_memories';
  var KEY_MOODS = 'xth_moods';
  var KEY_ACTIVE = 'xth_activeDollId';

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }
  function write(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      // 多半是容量超了（照片太多）
      alert('存储空间快满啦，照片太多会存不下～可以删掉一些旧回忆');
      return false;
    }
  }
  function genId() {
    return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* ========== 娃 ========== */
  function getDolls() {
    return read(KEY_DOLLS).slice().sort(function (a, b) {
      if (a.order !== b.order) return (a.order || 0) - (b.order || 0);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }
  function getDoll(id) {
    return read(KEY_DOLLS).find(function (d) { return d.id === id; }) || null;
  }
  function addDoll(data) {
    var dolls = read(KEY_DOLLS);
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
    write(KEY_DOLLS, dolls);
    if (!getActiveDollId()) setActiveDollId(doll.id);
    return doll;
  }
  function updateDoll(id, patch) {
    var dolls = read(KEY_DOLLS);
    var idx = dolls.findIndex(function (d) { return d.id === id; });
    if (idx === -1) return null;
    dolls[idx] = Object.assign({}, dolls[idx], patch);
    write(KEY_DOLLS, dolls);
    return dolls[idx];
  }
  function deleteDoll(id) {
    write(KEY_DOLLS, read(KEY_DOLLS).filter(function (d) { return d.id !== id; }));
    write(KEY_MEMORIES, read(KEY_MEMORIES).filter(function (m) { return m.dollId !== id; }));
    if (getActiveDollId() === id) {
      var left = getDolls();
      setActiveDollId(left.length ? left[0].id : '');
    }
  }

  /* ========== 主角 ========== */
  function getActiveDollId() {
    return localStorage.getItem(KEY_ACTIVE) || '';
  }
  function setActiveDollId(id) {
    localStorage.setItem(KEY_ACTIVE, id || '');
  }

  /* ========== 回忆 ========== */
  function getMemories(dollId) {
    return read(KEY_MEMORIES)
      .filter(function (m) { return m.dollId === dollId; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }
  function getMemory(id) {
    return read(KEY_MEMORIES).find(function (m) { return m.id === id; }) || null;
  }
  function addMemory(data) {
    var memories = read(KEY_MEMORIES);
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
    if (!write(KEY_MEMORIES, memories)) return null;
    return memory;
  }
  function deleteMemory(id) {
    write(KEY_MEMORIES, read(KEY_MEMORIES).filter(function (m) { return m.id !== id; }));
  }
  function countMemories(dollId) {
    return read(KEY_MEMORIES).filter(function (m) { return m.dollId === dollId; }).length;
  }

  /* ========== 心情库 ========== */
  function getMoods() { return read(KEY_MOODS); }
  function getMood(id) {
    return read(KEY_MOODS).find(function (m) { return m.id === id; }) || null;
  }
  function addMood(label, warmth) {
    var moods = read(KEY_MOODS);
    var exist = moods.find(function (m) { return m.label === label; });
    if (exist) return exist;
    var mood = { id: genId(), label: label, warmth: warmth || '平' };
    moods.push(mood);
    write(KEY_MOODS, moods);
    return mood;
  }

  /* ========== 日期工具 ========== */
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

  /* ========== 图片压缩（canvas） ========== */
  // file -> Promise<dataURL>。最长边压到 maxSize，JPEG 质量 0.72
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
            resolve(e.target.result); // 兜底原图
          }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.Store = {
    getDolls: getDolls, getDoll: getDoll, addDoll: addDoll, updateDoll: updateDoll, deleteDoll: deleteDoll,
    getActiveDollId: getActiveDollId, setActiveDollId: setActiveDollId,
    getMemories: getMemories, getMemory: getMemory, addMemory: addMemory, deleteMemory: deleteMemory, countMemories: countMemories,
    getMoods: getMoods, getMood: getMood, addMood: addMood
  };
  window.DateUtil = { toDateStr: toDateStr, today: today, daysTogether: daysTogether, friendlyDate: friendlyDate };
  window.Img = { compress: compressImage };
})();
