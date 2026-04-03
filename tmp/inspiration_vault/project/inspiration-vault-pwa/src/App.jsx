import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initialData } from './data/initialData';
import {
  saveToStorage,
  loadFromStorage,
  generateId,
  collectAllLinkableTitles,
  findEntryPath,
  findEntryById,
  getAllChildContent,
  updateEntryInTree,
  addEntryToParent,
  deleteEntryFromTree,
  reorderEntriesInParent,
  countWords,
  countEntries,
  compressImage,
} from './utils/helpers';
import { styles } from './styles';

const ContentRenderer = ({ content, allTitlesMap, currentBookId, onLinkClick, fontFamily }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !content) return;
    ref.current.innerHTML = content.replace(/【([^】]+)】/g, (m, kw) => {
      const t = allTitlesMap.get(kw);
      return t?.length ? `<span class="keyword linked" data-kw="${kw}">【${kw}】</span>` : `<span class="keyword">【${kw}】</span>`;
    });
    ref.current.querySelectorAll('.keyword.linked').forEach(el => {
      el.onclick = () => {
        const t = allTitlesMap.get(el.dataset.kw);
        if (t?.length) { const tg = t.find(x => x.bookId === currentBookId) || t[0]; onLinkClick(el.dataset.kw, tg.bookId, tg.entry.id); }
      };
    });
  }, [content, allTitlesMap, currentBookId, onLinkClick]);
  return <div ref={ref} className="content-body" style={{ fontFamily }} />;
};

const RichEditor = ({ content, onSave, fontFamily, activeFormats }) => {
  const ref = useRef(null);
  const timer = useRef(null);
  const lastSaved = useRef(content);

  useEffect(() => {
    if (ref.current && content !== undefined && ref.current.innerHTML !== content && content !== lastSaved.current) {
      ref.current.innerHTML = content || '<p><br></p>';
      lastSaved.current = content;
    }
  }, [content]);

  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (ref.current) {
        const html = ref.current.innerHTML;
        if (html !== lastSaved.current) { lastSaved.current = html; onSave(html); }
      }
    }, 300);
  }, [onSave]);

  const handleKeyDown = (e) => {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const hasF = activeFormats.bold || activeFormats.italic || activeFormats.underline || activeFormats.strike || activeFormats.size !== 'medium';
      if (hasF) {
        e.preventDefault();
        if (activeFormats.bold) document.execCommand('bold', false, null);
        if (activeFormats.italic) document.execCommand('italic', false, null);
        if (activeFormats.underline) document.execCommand('underline', false, null);
        if (activeFormats.strike) document.execCommand('strikeThrough', false, null);
        if (activeFormats.size === 'small') document.execCommand('fontSize', false, '2');
        else if (activeFormats.size === 'big') document.execCommand('fontSize', false, '4');
        else if (activeFormats.size === 'huge') document.execCommand('fontSize', false, '5');
        document.execCommand('insertText', false, e.key);
        save();
      }
    }
  };

  const forceSave = () => { if (ref.current) { const html = ref.current.innerHTML; lastSaved.current = html; onSave(html); } };

  useEffect(() => { return () => { if (timer.current) clearTimeout(timer.current); }; }, []);
  useEffect(() => { if (ref.current) { ref.current.forceSave = forceSave; ref.current.execCmd = (c, v) => { document.execCommand(c, false, v); save(); }; } });

  return <div ref={ref} className="rich-editor" contentEditable onInput={save} onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); save(); }} onKeyDown={handleKeyDown} onBlur={forceSave} style={{ fontFamily }} suppressContentEditableWarning />;
};

const SidebarItem = ({ entry, depth = 0, onSelect, currentId, expandedIds, onToggle }) => {
  const hasC = entry.children?.length > 0;
  const isExp = expandedIds.has(entry.id);
  return (<div className="sidebar-item-wrapper"><div className={`sidebar-item ${currentId === entry.id ? 'active' : ''}`} style={{ paddingLeft: `${12 + depth * 16}px` }} onClick={() => onSelect(entry)}>{hasC && <span className={`expand-icon ${isExp ? 'expanded' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(entry.id); }}>›</span>}<span className="sidebar-icon">{entry.isFolder ? '📁' : '📄'}</span><span className="sidebar-title">{entry.title}</span>{entry.linkable && <span className="link-star">⭐</span>}</div>{hasC && isExp && entry.children.map(c => <SidebarItem key={c.id} entry={c} depth={depth + 1} onSelect={onSelect} currentId={currentId} expandedIds={expandedIds} onToggle={onToggle} />)}</div>);
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => isOpen ? (<div className="modal-overlay" onClick={onCancel}><div className="modal-content confirm-modal" onClick={e => e.stopPropagation()}><h3>{title}</h3><p>{message}</p><div className="modal-actions"><button className="btn-cancel" onClick={onCancel}>取消</button><button className="btn-danger" onClick={onConfirm}>确认删除</button></div></div></div>) : null;
const ContextMenu = ({ isOpen, position, onClose, options }) => isOpen ? (<><div className="context-overlay" onClick={onClose} /><div className="context-menu" style={{ top: position.y, left: Math.min(position.x, window.innerWidth - 180) }}>{options.map((o, i) => (<div key={i} className={`context-item ${o.danger ? 'danger' : ''}`} onClick={() => { o.action(); onClose(); }}><span className="context-icon">{o.icon}</span>{o.label}</div>))}</div></>) : null;

const EntryModal = ({ isOpen, onClose, onSave, editingEntry, parentTitle, isFolder }) => {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [createAsFolder, setCreateAsFolder] = useState(false);
  useEffect(() => { if (editingEntry) { setTitle(editingEntry.title || ''); setSummary(editingEntry.summary || ''); } else { setTitle(''); setSummary(''); setCreateAsFolder(isFolder || false); } }, [editingEntry, isOpen, isFolder]);
  if (!isOpen) return null;
  return (<div className="modal-overlay" onClick={onClose}><div className="modal-content" onClick={e => e.stopPropagation()}><h3>{editingEntry ? '编辑词条' : (createAsFolder ? '新建分类' : '新建词条')}</h3>{parentTitle && <p className="modal-hint">添加到: {parentTitle}</p>}<input type="text" placeholder="标题" value={title} onChange={e => setTitle(e.target.value)} autoFocus /><input type="text" placeholder="简介（可选）" value={summary} onChange={e => setSummary(e.target.value)} />{!editingEntry && <label className="checkbox-label"><input type="checkbox" checked={createAsFolder} onChange={e => setCreateAsFolder(e.target.checked)} /><span>创建为分类文件夹</span></label>}<div className="modal-actions"><button className="btn-cancel" onClick={onClose}>取消</button><button className="btn-save" onClick={() => { if (title.trim()) { onSave({ title: title.trim(), summary: summary.trim(), isFolder: createAsFolder }); onClose(); } }} disabled={!title.trim()}>{editingEntry ? '保存' : '创建'}</button></div></div></div>);
};

const BookModal = ({ isOpen, onClose, onSave, editingBook }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [tags, setTags] = useState('');
  const [emoji, setEmoji] = useState('📖');
  const [coverImage, setCoverImage] = useState(null);
  const [showStats, setShowStats] = useState(true);
  const fileRef = useRef(null);
  const emojis = ['📖', '🌙', '⭐', '🏯', '🗡️', '🌸', '🔮', '🐉', '🦋', '🌊', '🔥', '💎'];
  useEffect(() => { if (editingBook) { setTitle(editingBook.title); setAuthor(editingBook.author || ''); setTags(editingBook.tags?.join(', ') || ''); setEmoji(editingBook.cover); setCoverImage(editingBook.coverImage); setShowStats(editingBook.showStats !== false); } else { setTitle(''); setAuthor(''); setTags(''); setEmoji('📖'); setCoverImage(null); setShowStats(true); } }, [editingBook, isOpen]);
  if (!isOpen) return null;
  return (<div className="modal-overlay" onClick={onClose}><div className="modal-content book-modal" onClick={e => e.stopPropagation()}><h3>{editingBook ? '编辑书籍' : '新建世界'}</h3><input type="text" placeholder="书名" value={title} onChange={e => setTitle(e.target.value)} autoFocus /><input type="text" placeholder="作者（可选）" value={author} onChange={e => setAuthor(e.target.value)} /><input type="text" placeholder="标签，逗号分隔" value={tags} onChange={e => setTags(e.target.value)} /><label className="checkbox-label"><input type="checkbox" checked={showStats} onChange={e => setShowStats(e.target.checked)} /><span>显示字数统计</span></label><div className="cover-section"><p className="section-label">封面</p>{coverImage ? (<div className="cover-preview"><img src={coverImage} alt="" /><button className="remove-cover" onClick={() => setCoverImage(null)}>×</button></div>) : (<div className="emoji-picker">{emojis.map(e => <span key={e} className={`emoji-option ${emoji === e ? 'selected' : ''}`} onClick={() => setEmoji(e)}>{e}</span>)}</div>)}<button className="upload-cover-btn" onClick={() => fileRef.current?.click()}>📷 上传封面</button><input ref={fileRef} type="file" accept="image/*" onChange={async e => { const f = e.target.files[0]; if (f) setCoverImage(await compressImage(f, 400)); }} style={{ display: 'none' }} /></div><div className="modal-actions"><button className="btn-cancel" onClick={onClose}>取消</button><button className="btn-save" onClick={() => { if (title.trim()) { onSave({ title: title.trim(), author, tags: tags.split(',').map(t => t.trim()).filter(Boolean), emoji, coverImage, showStats }); onClose(); } }} disabled={!title.trim()}>保存</button></div></div></div>);
};

const TextFormatMenu = ({ isOpen, onClose, activeFormats, onToggleFormat }) => isOpen ? (<><div className="format-menu-overlay" onClick={onClose} /><div className="format-menu"><p className="format-hint">点亮后输入即带格式</p><div className="format-row"><button className={activeFormats.bold ? 'active' : ''} onClick={() => onToggleFormat('bold')}><b>B</b></button><button className={activeFormats.italic ? 'active' : ''} onClick={() => onToggleFormat('italic')}><i>I</i></button><button className={activeFormats.underline ? 'active' : ''} onClick={() => onToggleFormat('underline')}><u>U</u></button><button className={activeFormats.strike ? 'active' : ''} onClick={() => onToggleFormat('strike')}><s>S</s></button></div><div className="format-row size-row"><button className={activeFormats.size === 'small' ? 'active' : ''} onClick={() => onToggleFormat('small')}>小</button><button className={activeFormats.size === 'medium' ? 'active' : ''} onClick={() => onToggleFormat('medium')}>中</button><button className={activeFormats.size === 'big' ? 'active' : ''} onClick={() => onToggleFormat('big')}>大</button><button className={activeFormats.size === 'huge' ? 'active' : ''} onClick={() => onToggleFormat('huge')}>特大</button></div></div></>) : null;

const AlignMenu = ({ isOpen, onClose, onAlign }) => isOpen ? (<><div className="format-menu-overlay" onClick={onClose} /><div className="format-menu align-menu"><div className="format-row"><button onClick={() => { onAlign('justifyLeft'); onClose(); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z"/></svg></button><button onClick={() => { onAlign('justifyCenter'); onClose(); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm3 4h12v2H6V7zm-3 4h18v2H3v-2zm3 4h12v2H6v-2zm-3 4h18v2H3v-2z"/></svg></button><button onClick={() => { onAlign('justifyRight'); onClose(); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm6 4h12v2H9V7zm-6 4h18v2H3v-2zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z"/></svg></button></div></div></>) : null;

const FontMenu = ({ isOpen, onClose, onSelectFont, currentFont }) => {
  const fonts = [{ n: '默认', v: "'Noto Serif SC', serif" }, { n: '宋体', v: "'Songti SC', serif" }, { n: '黑体', v: "'Heiti SC', sans-serif" }, { n: '楷体', v: "'Kaiti SC', serif" }, { n: '仿宋', v: "'FangSong SC', serif" }];
  return isOpen ? (<><div className="format-menu-overlay" onClick={onClose} /><div className="font-menu">{fonts.map(f => (<div key={f.v} className={`font-item ${currentFont === f.v ? 'active' : ''}`} onClick={() => { onSelectFont(f.v); onClose(); }} style={{ fontFamily: f.v }}>{f.n}</div>))}</div></>) : null;
};

const EditorToolbar = ({ onIndent, onFormat, onFont, onAlign, onImage, hasActive }) => {
  const imgRef = useRef(null);
  return (<div className="editor-toolbar-bottom"><button onClick={onIndent}>↵</button><button onClick={onFormat} className={hasActive ? 'has-active' : ''}>A</button><button onClick={onAlign}><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm3 4h12v2H6V7zm-3 4h18v2H3v-2zm3 4h12v2H6v-2zm-3 4h18v2H3v-2z"/></svg></button><button onClick={onFont}>T</button><button onClick={() => imgRef.current?.click()}>🖼</button><input ref={imgRef} type="file" accept="image/*" onChange={onImage} style={{ display: 'none' }} /></div>);
};

const AddMenu = ({ isOpen, onClose, onAddEntry, onAddFolder, onReorder }) => isOpen ? (<><div className="add-menu-overlay" onClick={onClose} /><div className="add-menu"><div className="add-menu-item" onClick={() => { onReorder(); onClose(); }}><span>↕️</span><span>调整排序</span></div><div className="add-menu-item" onClick={() => { onAddFolder(); onClose(); }}><span>📁</span><span>新建分类</span></div><div className="add-menu-item" onClick={() => { onAddEntry(); onClose(); }}><span>📄</span><span>新建词条</span></div></div></>) : null;

const ReorderList = ({ entries, onReorder, onExit }) => {
  const [di, setDi] = useState(null);
  const [oi, setOi] = useState(null);
  const ref = useRef(null);
  return (<div className="reorder-mode"><div className="reorder-header"><h3>调整排序</h3><button className="done-btn" onClick={onExit}>完成</button></div><p className="reorder-hint">长按拖动调整顺序</p><div className="reorder-list" ref={ref} onTouchMove={(e) => { if (di === null) return; e.preventDefault(); const t = e.touches[0]; const items = ref.current?.querySelectorAll('.reorder-item'); if (items) for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (t.clientY >= r.top && t.clientY <= r.bottom) { setOi(i); break; } } }} onTouchEnd={() => { if (di !== null && oi !== null && di !== oi) onReorder(di, oi); setDi(null); setOi(null); }}>{entries.map((e, i) => (<div key={e.id} className={`reorder-item ${di === i ? 'dragging' : ''} ${oi === i && di !== i ? 'over' : ''}`} onTouchStart={() => { setDi(i); if (navigator.vibrate) navigator.vibrate(30); }}><div className="reorder-content"><span>{e.isFolder ? '📁' : '📄'}</span><span>{e.title}</span></div><div className="bookmark-tab">≡</div></div>))}</div></div>);
};

export default function App() {
  const [data, setData] = useState(() => loadFromStorage() || initialData);
  const [currentBook, setCurrentBook] = useState(null);
  const [currentEntry, setCurrentEntry] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [navigationStack, setNavigationStack] = useState([]);
  const [mergedContents, setMergedContents] = useState([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingBook, setEditingBook] = useState(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, options: [] });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false });
  const [jumpHistory, setJumpHistory] = useState([]);
  const [slideAnim, setSlideAnim] = useState('');
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [currentFont, setCurrentFont] = useState("'Noto Serif SC', serif");
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, strike: false, size: 'medium' });
  const [isReorderMode, setIsReorderMode] = useState(false);
  const longPressTimer = useRef(null);
  const touchStartX = useRef(0);

  useEffect(() => { saveToStorage(data); }, [data]);
  const allTitlesMap = useMemo(() => collectAllLinkableTitles(data.books), [data.books]);
  useEffect(() => { if (currentBook) { const u = data.books.find(b => b.id === currentBook.id); if (u && u !== currentBook) setCurrentBook(u); } }, [data.books]);
  useEffect(() => { if (currentEntry && currentBook) { const f = findEntryById(currentBook.entries, currentEntry.id); if (f && f !== currentEntry) setCurrentEntry(f); } }, [currentBook]);

  const saveContent = useCallback((html, eid = null, bid = null) => {
    const eId = eid || currentEntry?.id;
    const bId = bid || currentBook?.id;
    if (!eId || !bId) return;
    setData(prev => ({ ...prev, books: prev.books.map(b => b.id === bId ? { ...b, entries: updateEntryInTree(b.entries, eId, { content: html }) } : b) }));
  }, [currentEntry?.id, currentBook?.id]);

  const initMerged = useCallback((e) => { if (!e || !currentBook) return; setMergedContents(getAllChildContent(e, currentBook.entries).map(i => ({ id: i.id, title: i.title, content: i.content || '', isNew: false }))); }, [currentBook]);

  const handleLongPressStart = (e, type, item) => { const t = e.touches ? e.touches[0] : e; const pos = { x: t.clientX, y: t.clientY }; longPressTimer.current = setTimeout(() => { let opts = []; if (type === 'entry') { opts = [{ icon: '✏️', label: '编辑信息', action: () => { setEditingEntry(item); setShowEntryModal(true); } }, { icon: item.linkable ? '🚫' : '⭐', label: item.linkable ? '关闭跳转' : '开启跳转', action: () => setData(prev => ({ ...prev, books: prev.books.map(b => b.id === currentBook.id ? { ...b, entries: updateEntryInTree(b.entries, item.id, { linkable: !item.linkable }) } : b) })) }, { icon: '🗑️', label: '删除', danger: true, action: () => setConfirmModal({ isOpen: true, title: '确认删除', message: `删除「${item.title}」？`, onConfirm: () => { setData(prev => ({ ...prev, books: prev.books.map(b => b.id === currentBook.id ? { ...b, entries: deleteEntryFromTree(b.entries, item.id) } : b) })); if (currentEntry?.id === item.id) handleBack(); setConfirmModal({ isOpen: false }); } }) }]; } else if (type === 'book') { opts = [{ icon: '✏️', label: '编辑', action: () => { setEditingBook(item); setShowBookModal(true); } }, { icon: '🗑️', label: '删除', danger: true, action: () => setConfirmModal({ isOpen: true, title: '确认删除', message: `删除「${item.title}」？`, onConfirm: () => { setData(prev => ({ ...prev, books: prev.books.filter(b => b.id !== item.id) })); setConfirmModal({ isOpen: false }); } }) }]; } setContextMenu({ isOpen: true, position: pos, options: opts }); }, 500); };
  const handleLongPressEnd = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  const handleBookSelect = (b) => { setCurrentBook(b); setCurrentEntry(null); setViewMode('list'); setNavigationStack([]); };
  const handleBackToShelf = () => { setSlideAnim('slide-out'); setTimeout(() => { setCurrentBook(null); setCurrentEntry(null); setViewMode('list'); setNavigationStack([]); setIsSidebarOpen(false); setJumpHistory([]); setIsReorderMode(false); setSlideAnim(''); }, 200); };
  const handleEntryClick = (e) => { setSlideAnim('slide-in'); setNavigationStack(prev => [...prev, currentEntry].filter(Boolean)); setCurrentEntry(e); if (e.isFolder || e.children?.length > 0) setViewMode('list'); else { setViewMode('single'); setIsReadOnly(true); } setTimeout(() => setSlideAnim(''), 250); };
  const handleBack = () => { setSlideAnim('slide-out'); setTimeout(() => { if (navigationStack.length > 0) { const p = navigationStack[navigationStack.length - 1]; setNavigationStack(s => s.slice(0, -1)); setCurrentEntry(p); setViewMode('list'); } else { setCurrentEntry(null); setViewMode('list'); } setSlideAnim(''); setIsReorderMode(false); }, 200); };
  const handleJumpBack = () => { if (jumpHistory.length > 0) { const l = jumpHistory[jumpHistory.length - 1]; setJumpHistory(p => p.slice(0, -1)); const b = data.books.find(x => x.id === l.bookId); if (b) { setCurrentBook(b); setNavigationStack(l.navStack); setCurrentEntry(l.entry); setViewMode(l.viewMode); } } };
  const handleSidebarSelect = (e) => { const p = findEntryPath(currentBook.entries, e.id); if (p) { setNavigationStack(p.slice(0, -1)); setCurrentEntry(e); if (e.isFolder || e.children?.length > 0) setViewMode('list'); else setViewMode('single'); } setIsSidebarOpen(false); };
  const handleLinkClick = useCallback((kw, tbid, teid) => { setJumpHistory(p => [...p, { bookId: currentBook.id, entry: currentEntry, navStack: navigationStack, viewMode }]); const tb = data.books.find(b => b.id === tbid); if (tb) { setSlideAnim('slide-in'); setCurrentBook(tb); const path = findEntryPath(tb.entries, teid); if (path) { const te = path[path.length - 1]; setNavigationStack(path.slice(0, -1)); setCurrentEntry(te); if (te.isFolder && te.linkable) { setViewMode('merged'); setTimeout(() => initMerged(te), 0); } else if (te.isFolder) setViewMode('list'); else setViewMode('single'); } setTimeout(() => setSlideAnim(''), 250); } }, [currentBook, currentEntry, navigationStack, viewMode, data.books, initMerged]);

  const handleMergedChange = (i, f, v) => { const nc = mergedContents.map((x, j) => j === i ? { ...x, [f]: v } : x); setMergedContents(nc); if (!nc[i].isNew && f === 'content') saveContent(v, nc[i].id, currentBook.id); };
  const handleAddMerged = () => { const ne = { id: generateId(), title: '新词条', content: '', isNew: true }; setMergedContents(p => [...p, ne]); setData(prev => ({ ...prev, books: prev.books.map(b => b.id === currentBook.id ? { ...b, entries: addEntryToParent(b.entries, currentEntry.id, { ...ne, summary: '', isFolder: false, linkable: true, children: [] }) } : b) })); };
  const handleAddEntry = (d) => { const ne = { id: generateId(), title: d.title, summary: d.summary || '', content: '', isFolder: d.isFolder, linkable: !d.isFolder, children: d.isFolder ? [] : undefined }; setData(prev => ({ ...prev, books: prev.books.map(b => b.id === currentBook.id ? { ...b, entries: addEntryToParent(b.entries, currentEntry?.id || null, ne) } : b) })); };
  const handleUpdateEntry = (d) => { if (!editingEntry) return; setData(prev => ({ ...prev, books: prev.books.map(b => b.id === currentBook.id ? { ...b, entries: updateEntryInTree(b.entries, editingEntry.id, { title: d.title, summary: d.summary }) } : b) })); setEditingEntry(null); };
  const handleAddBook = ({ title, author, tags, emoji, coverImage, showStats }) => { if (editingBook) { setData(prev => ({ ...prev, books: prev.books.map(b => b.id === editingBook.id ? { ...b, title, author, tags, cover: emoji, coverImage, showStats } : b) })); setEditingBook(null); } else { const colors = ['#2D3047', '#1A1A2E', '#4A0E0E', '#0E4A2D', '#3D2E4A', '#4A3D0E']; setData(prev => ({ ...prev, books: [...prev.books, { id: generateId(), title, author, tags, cover: emoji, coverImage, showStats, color: colors[Math.floor(Math.random() * colors.length)], entries: [] }] })); } };
  const handleReorder = (fi, ti) => setData(prev => ({ ...prev, books: prev.books.map(b => b.id === currentBook.id ? { ...b, entries: reorderEntriesInParent(b.entries, currentEntry?.id || null, fi, ti) } : b) }));

  const handleToggleFormat = (t) => setActiveFormats(p => ['small', 'medium', 'big', 'huge'].includes(t) ? { ...p, size: t } : { ...p, [t]: !p[t] });
  const handleAlign = (c) => { const ed = document.querySelector('.rich-editor'); if (ed) { ed.focus(); document.execCommand(c, false, null); ed.forceSave?.(); } };
  const handleIndent = () => { const ed = document.querySelector('.rich-editor'); if (!ed) return; ed.querySelectorAll('p').forEach(p => { if (p.textContent && !p.textContent.startsWith('　　')) p.textContent = '　　' + p.textContent; }); ed.forceSave?.(); };
  const handleImageUpload = async (e) => { const f = e.target.files[0]; if (f) { const c = await compressImage(f, 600); const ed = document.querySelector('.rich-editor'); if (ed) { ed.focus(); document.execCommand('insertHTML', false, `<p style="text-align:center"><img src="${c}" style="max-width:100%;border-radius:8px" /></p>`); ed.forceSave?.(); } } e.target.value = ''; };
  const handleEntrySwipe = (e, dx) => { if (dx < -80 && (e.isFolder || e.children?.length > 0)) { setSlideAnim('slide-in'); setNavigationStack(p => [...p, currentEntry].filter(Boolean)); setCurrentEntry(e); setViewMode('merged'); setTimeout(() => initMerged(e), 50); setTimeout(() => setSlideAnim(''), 250); } };

  const currentEntries = currentEntry?.children || currentBook?.entries || [];
  const isEditing = !isReadOnly && (viewMode === 'single' || viewMode === 'merged');
  const hasActiveFormat = activeFormats.bold || activeFormats.italic || activeFormats.underline || activeFormats.strike || activeFormats.size !== 'medium';

  if (!currentBook) return (<div className="app bookshelf-view"><header className="bookshelf-header"><h1>灵感穹顶</h1><p className="subtitle">拾起每一颗星星</p><p className="subtitle">便能拥有属于你的宇宙</p></header><div className="bookshelf">{data.books.map(b => (<div key={b.id} className="book-card" style={{ '--book-color': b.color }} onClick={() => handleBookSelect(b)} onTouchStart={e => handleLongPressStart(e, 'book', b)} onTouchEnd={handleLongPressEnd} onTouchMove={handleLongPressEnd}><div className="book-spine" /><div className="book-cover">{b.coverImage ? <img src={b.coverImage} alt="" className="cover-image" /> : <span className="book-emoji">{b.cover}</span>}</div><div className="book-shadow" /><div className="book-meta"><h2>{b.title}</h2>{b.author && <p>{b.author} 著</p>}</div></div>))}<div className="book-card add-book" onClick={() => { setEditingBook(null); setShowBookModal(true); }}><div className="book-cover"><span className="add-icon">+</span></div><div className="book-meta"><h2>新建世界</h2></div></div></div><BookModal isOpen={showBookModal} onClose={() => { setShowBookModal(false); setEditingBook(null); }} onSave={handleAddBook} editingBook={editingBook} /><ContextMenu isOpen={contextMenu.isOpen} position={contextMenu.position} onClose={() => setContextMenu({ ...contextMenu, isOpen: false })} options={contextMenu.options} /><ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({ isOpen: false })} /><style>{styles}</style></div>);

  return (<div className="app main-view"><div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}><div className="sidebar-header"><h2>{currentBook.title}</h2><button className="close-sidebar" onClick={() => setIsSidebarOpen(false)}>×</button></div><div className="sidebar-content">{currentBook.entries.map(e => <SidebarItem key={e.id} entry={e} onSelect={handleSidebarSelect} currentId={currentEntry?.id} expandedIds={expandedIds} onToggle={id => setExpandedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; })} />)}</div></div>{isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />}<div className="main-content" onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }} onTouchEnd={e => { if (e.changedTouches[0].clientX - touchStartX.current > 80 && (currentEntry || navigationStack.length > 0)) handleBack(); }}><header className="top-bar"><div className="top-left"><button className="icon-btn" onClick={() => setIsSidebarOpen(true)}>☰</button>{jumpHistory.length > 0 && <button className="icon-btn jump-back-btn" onClick={handleJumpBack}>↩️</button>}{(currentEntry || navigationStack.length > 0) && <button className="icon-btn" onClick={handleBack}>←</button>}<button className="icon-btn" onClick={handleBackToShelf}>🏠</button></div><div className="breadcrumb"><span className="book-name">{currentBook.title}</span>{currentEntry && <><span className="separator">/</span><span className="current-title">{currentEntry.title}</span></>}</div><div className="top-right">{(viewMode === 'single' || viewMode === 'merged') && (<div className="read-mode-toggle" onClick={() => setIsReadOnly(!isReadOnly)}><span className={`toggle-label ${isReadOnly ? 'active' : ''}`}>阅读</span><div className={`toggle-switch ${!isReadOnly ? 'edit-mode' : ''}`}><div className="toggle-knob" /></div><span className={`toggle-label ${!isReadOnly ? 'active' : ''}`}>编辑</span></div>)}</div></header>{!currentEntry && currentBook.showStats && (<div className="book-info-card"><div className="info-cover">{currentBook.coverImage ? <img src={currentBook.coverImage} alt="" /> : <span>{currentBook.cover}</span>}</div><div className="info-details">{currentBook.author && <p>作者：{currentBook.author}</p>}{currentBook.tags?.length > 0 && <p>标签：{currentBook.tags.join('、')}</p>}<p>词条：{countEntries(currentBook.entries)}条</p><p>字数：{countWords(currentBook.entries).toLocaleString()}字</p></div></div>)}<main className={`content-area ${slideAnim}`}>{viewMode === 'list' && !isReorderMode && (<>{currentEntry && <div className="list-header"><h1>{currentEntry.title}</h1>{currentEntry.summary && <p className="summary">{currentEntry.summary}</p>}</div>}<p className="swipe-hint">💡 左滑合并视图 · 右滑返回 · 长按编辑</p><div className="entry-list">{currentEntries.map(e => { let tx = 0; return (<div key={e.id} className="entry-card" onClick={() => handleEntryClick(e)} onTouchStart={ev => { tx = ev.touches[0].clientX; handleLongPressStart(ev, 'entry', e); }} onTouchMove={handleLongPressEnd} onTouchEnd={ev => { handleLongPressEnd(); handleEntrySwipe(e, ev.changedTouches[0].clientX - tx); }}><div className="entry-icon">{e.isFolder ? '📁' : '📄'}</div><div className="entry-info"><h3>{e.title}{e.linkable && <span className="star-badge">⭐</span>}</h3><p>{e.summary}</p></div><span className="entry-arrow">›</span></div>); })}</div>{currentEntries.length === 0 && <div className="empty-state"><span>✨</span><p>点击右下角添加</p></div>}</>)}{viewMode === 'list' && isReorderMode && <ReorderList entries={currentEntries} onReorder={handleReorder} onExit={() => setIsReorderMode(false)} />}{viewMode === 'single' && currentEntry && (<div className="single-view"><div className="content-header"><h1>{currentEntry.title}</h1>{!isReadOnly && <button className="edit-meta-btn" onClick={() => { setEditingEntry(currentEntry); setShowEntryModal(true); }}>✏️</button>}</div>{isReadOnly ? <ContentRenderer content={currentEntry.content} allTitlesMap={allTitlesMap} currentBookId={currentBook.id} onLinkClick={handleLinkClick} fontFamily={currentFont} /> : <RichEditor content={currentEntry.content} onSave={html => saveContent(html)} fontFamily={currentFont} activeFormats={activeFormats} />}</div>)}{viewMode === 'merged' && currentEntry && (<div className="merged-view"><div className="content-header merged-header"><h1>{currentEntry.title}</h1><p className="merged-hint">📖 合并视图</p></div>{isReadOnly ? (<div className="merged-content-read">{getAllChildContent(currentEntry, currentBook.entries).map((it, i, arr) => (<div key={it.id} className="merged-section"><div className="section-title" onClick={() => handleSidebarSelect(it)}>• {it.title}</div><ContentRenderer content={it.content} allTitlesMap={allTitlesMap} currentBookId={currentBook.id} onLinkClick={handleLinkClick} fontFamily={currentFont} />{i < arr.length - 1 && <div className="section-divider" />}</div>))}</div>) : (<div className="merged-content-edit">{mergedContents.map((it, i) => (<div key={it.id} className="merged-edit-section"><div className="merged-edit-header">• <input type="text" value={it.title} onChange={ev => handleMergedChange(i, 'title', ev.target.value)} className="merged-title-input" /></div><div className="merged-editor-wrap" contentEditable dangerouslySetInnerHTML={{ __html: it.content }} onBlur={ev => handleMergedChange(i, 'content', ev.target.innerHTML)} style={{ fontFamily: currentFont }} /></div>))}<button className="add-merged-entry-btn" onClick={handleAddMerged}>+ 添加词条</button></div>)}</div>)}</main>{viewMode === 'list' && !isReorderMode && (<><button className={`fab ${showAddMenu ? 'active' : ''}`} onClick={() => setShowAddMenu(!showAddMenu)}><span style={{ transform: showAddMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span></button><AddMenu isOpen={showAddMenu} onClose={() => setShowAddMenu(false)} onAddEntry={() => { setEditingEntry(null); setIsCreatingFolder(false); setShowEntryModal(true); }} onAddFolder={() => { setEditingEntry(null); setIsCreatingFolder(true); setShowEntryModal(true); }} onReorder={() => setIsReorderMode(true)} /></>)}{isEditing && <EditorToolbar onIndent={handleIndent} onFormat={() => setShowFormatMenu(true)} onAlign={() => setShowAlignMenu(true)} onFont={() => setShowFontMenu(true)} onImage={handleImageUpload} hasActive={hasActiveFormat} />}<TextFormatMenu isOpen={showFormatMenu} onClose={() => setShowFormatMenu(false)} activeFormats={activeFormats} onToggleFormat={handleToggleFormat} /><AlignMenu isOpen={showAlignMenu} onClose={() => setShowAlignMenu(false)} onAlign={handleAlign} /><FontMenu isOpen={showFontMenu} onClose={() => setShowFontMenu(false)} onSelectFont={setCurrentFont} currentFont={currentFont} /></div><EntryModal isOpen={showEntryModal} onClose={() => { setShowEntryModal(false); setEditingEntry(null); }} onSave={editingEntry ? handleUpdateEntry : handleAddEntry} editingEntry={editingEntry} parentTitle={currentEntry?.title} isFolder={isCreatingFolder} /><ContextMenu isOpen={contextMenu.isOpen} position={contextMenu.position} onClose={() => setContextMenu({ ...contextMenu, isOpen: false })} options={contextMenu.options} /><ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({ isOpen: false })} /><style>{styles}</style></div>);
}

