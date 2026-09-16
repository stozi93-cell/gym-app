import { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  serverTimestamp,
  arrayUnion,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { Panel, StatusPill } from "../components/ui/Primitives";
import ScrollArea from "../components/ui/ScrollArea";

const MAX_VISIBLE_POSTS = 6;

function PinIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m16 3 5 5-4.5 4.5 1 4.5-1 1-5-5L6 18.5 4.5 17l5.5-5.5-5-5 1-1 4.5 1L16 3Z" />
      <path d="m14 10-4 4" />
    </svg>
  );
}

export default function Forum() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🔑 LOCAL read state (source of truth for UI)
  const [readAnnouncements, setReadAnnouncements] = useState([]);

  // create
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  // edit
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // 🔧 textarea refs (ADMIN ONLY UX)
  const createTextareaRef = useRef(null);
  const editTextareaRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;

    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const savedReadAnnouncements = snap.data().readAnnouncements || [];
      setReadAnnouncements((prev) => {
        return Array.from(new Set([...prev, ...savedReadAnnouncements]));
      });
    });
  }, [user?.uid]);

  // 🔧 auto-resize helper
  function autoResize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  const loadData = useCallback(async () => {
    setLoading(true);

    const snap = await getDocs(
      query(collection(db, "forumPosts"), orderBy("createdAt", "desc"))
    );

    let data = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    if (!showArchived) {
      data = data.filter((p) => !p.archived);
    }

    data.sort((a, b) => (b.pinned === true) - (a.pinned === true));

    // IMPORTANT: limit only for non-admin
    setPosts(isAdmin ? data : data.slice(0, MAX_VISIBLE_POSTS));

    if (isAdmin) {
      const usersSnap = await getDocs(collection(db, "users"));
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    setLoading(false);
  }, [showArchived, isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  async function markRead(postId) {
    if (!user || readAnnouncements.includes(postId)) return;

    // optimistic UI update
    setReadAnnouncements((prev) => [...prev, postId]);

    try {
      await updateDoc(doc(db, "users", user.uid), {
        readAnnouncements: arrayUnion(postId),
      });
    } catch (error) {
      console.error("Announcement read update failed", error);
      setReadAnnouncements((prev) => prev.filter((id) => id !== postId));
    }
  }

  function openPost(postId) {
    setSelectedPostId(postId);
    markRead(postId);
  }

  function closePost() {
    setSelectedPostId(null);
    setEditingId(null);
  }

  useEffect(() => {
    if (!selectedPostId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setSelectedPostId(null);
        setEditingId(null);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedPostId]);

  function isUnread(post) {
    return !readAnnouncements.includes(post.id);
  }

  function readStats(post) {
    const total = users.length;
    const read = users.filter((u) =>
      u.readAnnouncements?.includes(post.id)
    );
    const unread = users.filter(
      (u) => !u.readAnnouncements?.includes(post.id)
    );
    return { total, read, unread };
  }

  async function createPost() {
    if (!title.trim() || !content.trim()) return;

    await addDoc(collection(db, "forumPosts"), {
      title,
      content,
      pinned,
      archived: false,
      createdAt: serverTimestamp(),
    });

    setTitle("");
    setContent("");
    setPinned(false);

    if (createTextareaRef.current) {
      createTextareaRef.current.style.height = "";
    }

    loadData();
  }

  async function saveEdit(postId) {
    if (!editTitle.trim() || !editContent.trim()) return;

    await updateDoc(doc(db, "forumPosts", postId), {
      title: editTitle,
      content: editContent,
    });

    setEditingId(null);

    if (editTextareaRef.current) {
      editTextareaRef.current.style.height = "";
    }

    loadData();
  }

  async function togglePin(post) {
    await updateDoc(doc(db, "forumPosts", post.id), {
      pinned: !post.pinned,
    });
    loadData();
  }

  async function archivePost(post) {
    await updateDoc(doc(db, "forumPosts", post.id), { archived: true });
    closePost();
    loadData();
  }

  async function deletePost(post) {
    if (!window.confirm("Trajno obrisati ovu objavu?")) return;
    await deleteDoc(doc(db, "forumPosts", post.id));
    closePost();
    loadData();
  }

  if (loading) return null;


  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md space-y-3">
        <Panel className="p-4">

          {isAdmin && (
            <div className="mb-4 space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Naslov"
                className="w-full rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
              />
              <textarea
                ref={createTextareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  autoResize(e.target);
                }}
                placeholder="Tekst objave ili saveta"
                rows={3}
                className="w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-neutral-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-brand-blue-500"
              />
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 text-sm text-neutral-400">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                  />
                  Istaknuto
                </label>
                <button
                  onClick={createPost}
                  className="rounded-xl bg-brand-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-glow"
                >
                  Objavi
                </button>
              </div>

              <button
                onClick={() => setShowArchived((p) => !p)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-300"
              >
                {showArchived ? "Sakrij arhivirana" : "Prikaži arhivirana"}
              </button>
            </div>
          )}

          <div className="space-y-3">
            {posts.map((post) => {
              const open = selectedPostId === post.id;
              const unread = isUnread(post);
              const stats = isAdmin ? readStats(post) : null;

              return (
                <div
                  key={post.id}
                  className={`overflow-hidden rounded-2xl border bg-neutral-950/50 ${
                    unread ? "border-brand-blue-500/35" : "border-white/10 opacity-75"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openPost(post.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2 font-medium text-white">
                      {post.pinned && (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-amber-400/10 text-amber-200">
                          <PinIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className="truncate">{post.title}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      {unread && (
                        <span className="h-2 w-2 rounded-full bg-brand-blue-400" />
                      )}
                      <span aria-hidden="true" className="text-lg text-neutral-400">›</span>
                    </div>
                  </button>

                  {open && createPortal(
                    <div
                      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
                      onClick={closePost}
                      role="presentation"
                    >
                      <section
                        role="dialog"
                        aria-modal="true"
                        aria-label={post.title}
                        onClick={(event) => event.stopPropagation()}
                        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-white/15 bg-neutral-900 shadow-2xl"
                      >
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2">
                            {post.pinned && <PinIcon className="h-4 w-4 shrink-0 text-amber-200" />}
                            <h2 className="min-w-0 break-words text-base font-semibold text-white">{post.title}</h2>
                          </div>
                          <button
                            type="button"
                            onClick={closePost}
                            aria-label="Zatvori objavu"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-xl text-neutral-300"
                          >
                            ×
                          </button>
                        </div>
                        <ScrollArea containerClassName="min-h-0 flex-1" className="h-full space-y-3 px-4 py-4 text-sm text-neutral-300">
                      {editingId === post.id ? (
                        <>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-gray-100 outline-none focus:border-brand-blue-500"
                          />
                          <textarea
                            ref={editTextareaRef}
                            value={editContent}
                            onChange={(e) => {
                              setEditContent(e.target.value);
                              autoResize(e.target);
                            }}
                            rows={3}
                            className="w-full resize-none overflow-hidden rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-gray-100 outline-none focus:border-brand-blue-500"
                          />
                          <div className="flex gap-3">
                            <button
                              onClick={() => saveEdit(post.id)}
                              className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300"
                            >
                              Sačuvaj
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                if (editTextareaRef.current) {
                                  editTextareaRef.current.style.height = "";
                                }
                              }}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-neutral-300"
                            >
                              Otkaži
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap">
                            {post.content}
                          </p>

                          {isAdmin && (
                            <>
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-400">
                                Pročitano: {stats.read.length} / {stats.total}
                              </div>

                              {stats.unread.length > 0 && (
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-400">
                                  Nisu pročitali:
                                  <ul className="ml-3 list-disc">
                                    {stats.unread.map((u) => (
                                      <li key={u.id}>
                                        {u.name} {u.surname}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-2 pt-2 text-sm">
                                <button
                                  onClick={() => {
                                    setEditingId(post.id);
                                    setEditTitle(post.title);
                                    setEditContent(post.content);
                                    setTimeout(
                                      () => autoResize(editTextareaRef.current),
                                      0
                                    );
                                  }}
                                  className="rounded-xl border border-brand-blue-500/25 bg-brand-blue-500/10 px-3 py-2 text-xs font-medium text-brand-blue-300"
                                >
                                  Izmeni
                                </button>
                                <button
                                  onClick={() => togglePin(post)}
                                  className="flex items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200"
                                >
                                  <PinIcon className="h-3.5 w-3.5" />
                                  {post.pinned ? "Ukloni pin" : "Pinuj"}
                                </button>
                                {!post.archived ? (
                                  <button
                                    onClick={() => archivePost(post)}
                                    className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200"
                                  >
                                    Arhiviraj
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => deletePost(post)}
                                    className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300"
                                  >
                                    Obriši trajno
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </>
                      )}
                        </ScrollArea>
                      </section>
                    </div>,
                    document.body
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
