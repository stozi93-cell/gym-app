import { useEffect, useState, useRef } from "react";
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
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

const MAX_VISIBLE_POSTS = 6;

export default function Forum() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
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

  // init read state from profile
  useEffect(() => {
    setReadAnnouncements(profile?.readAnnouncements || []);
  }, [profile?.readAnnouncements]);

  useEffect(() => {
    loadData();
  }, [showArchived]);

  // 🔧 auto-resize helper
  function autoResize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  async function loadData() {
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
  }

  async function markRead(postId) {
    if (!user || readAnnouncements.includes(postId)) return;

    // optimistic UI update
    setReadAnnouncements((prev) => [...prev, postId]);

    await updateDoc(doc(db, "users", user.uid), {
      readAnnouncements: arrayUnion(postId),
    });
  }

  function toggleExpand(postId) {
    const next = expandedId === postId ? null : postId;
    setExpandedId(next);
    if (next) markRead(postId);
  }

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
    loadData();
  }

  async function deletePost(post) {
    if (!window.confirm("Trajno obrisati ovo obaveštenje?")) return;
    await deleteDoc(doc(db, "forumPosts", post.id));
    loadData();
  }

  if (loading) {
    return (
      <p className="text-center mt-10 text-gray-500">
        Učitavanje obaveštenja…
      </p>
    );
  }

  return (
    <div className="px-4 py-6 flex justify-center">
      <div className="w-full max-w-md">
        <div className="bg-neutral-900 rounded-2xl p-4">

          <h2 className="text-lg font-semibold text-gray-100 mb-4 text-center">
            Obaveštenja
          </h2>

          {isAdmin && (
            <div className="mb-4 space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Naslov"
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 text-gray-100"
              />
              <textarea
                ref={createTextareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  autoResize(e.target);
                }}
                placeholder="Tekst obaveštenja"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 text-gray-100 resize-none overflow-hidden"
              />
              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-400 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                  />
                  Istaknuto
                </label>
                <button
                  onClick={createPost}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm"
                >
                  Objavi
                </button>
              </div>

              <button
                onClick={() => setShowArchived((p) => !p)}
                className="text-sm text-gray-400 underline"
              >
                {showArchived ? "Sakrij arhivirana" : "Prikaži arhivirana"}
              </button>
            </div>
          )}

          <div className="space-y-3">
            {posts.map((post) => {
              const open = expandedId === post.id;
              const unread = isUnread(post);
              const stats = isAdmin ? readStats(post) : null;

              return (
                <div
                  key={post.id}
                  className={`rounded-xl bg-neutral-800 ${
                    unread ? "border border-neutral-500" : "opacity-70"
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(post.id)}
                    className="w-full px-4 py-3 flex justify-between items-center text-left"
                  >
                    <span className="font-medium text-gray-100">
                      {post.pinned && "📌 "}
                      {post.title}
                    </span>

                    <div className="flex items-center gap-2">
                      {unread && (
                        <span className="w-2 h-2 rounded-full bg-gray-300" />
                      )}
                      <span className="text-gray-400 text-sm">
                        {open ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {open && (
                    <div className="px-4 pb-4 text-sm text-gray-300 space-y-3">
                      {editingId === post.id ? (
                        <>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full px-3 py-2 rounded bg-neutral-700 text-gray-100"
                          />
                          <textarea
                            ref={editTextareaRef}
                            value={editContent}
                            onChange={(e) => {
                              setEditContent(e.target.value);
                              autoResize(e.target);
                            }}
                            rows={3}
                            className="w-full px-3 py-2 rounded bg-neutral-700 text-gray-100 resize-none overflow-hidden"
                          />
                          <div className="flex gap-3">
                            <button
                              onClick={() => saveEdit(post.id)}
                              className="text-blue-400 underline"
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
                              className="text-gray-400 underline"
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
                              <div className="text-xs text-gray-400">
                                Pročitano: {stats.read.length} / {stats.total}
                              </div>

                              {stats.unread.length > 0 && (
                                <div className="text-xs text-gray-400">
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

                              <div className="flex gap-4 text-sm pt-2">
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
                                  className="text-blue-400 underline"
                                >
                                  Izmeni
                                </button>
                                <button
                                  onClick={() => togglePin(post)}
                                  className="text-blue-400 underline"
                                >
                                  {post.pinned ? "Ukloni pin" : "Pinuj"}
                                </button>
                                {!post.archived ? (
                                  <button
                                    onClick={() => archivePost(post)}
                                    className="text-yellow-400 underline"
                                  >
                                    Arhiviraj
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => deletePost(post)}
                                    className="text-red-400 underline"
                                  >
                                    Obriši trajno
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
