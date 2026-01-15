import { useEffect, useState, useRef } from "react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

/**
 * VESTI v1
 * - Announcements-first
 * - Admin-only posting
 * - Optional flat comments (feature-flagged)
 */

const COMMENTS_ENABLED = true;

export default function Forum() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // create / edit
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const [expanded, setExpanded] = useState({});
  const [commentText, setCommentText] = useState({});

  const contentRefs = useRef({});

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    try {
      setLoading(true);
      const q = query(
        collection(db, "forumPosts"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);

      let data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        comments: d.data().comments || [],
      }));

      data = data.filter((p) => !p.archived);
      data.sort((a, b) => (b.pinned === true) - (a.pinned === true));

      setPosts(data);
    } catch (err) {
      console.error(err);
      alert("Greška pri učitavanju vesti.");
    } finally {
      setLoading(false);
    }
  }

  // --- Admin actions ---

  async function createPost() {
    if (!title.trim() || !content.trim())
      return alert("Naslov i sadržaj su obavezni.");

    await addDoc(collection(db, "forumPosts"), {
      title,
      content,
      pinned,
      archived: false,
      createdAt: serverTimestamp(),
      authorId: user.uid,
      authorName: `${profile?.name || ""} ${profile?.surname || ""}`.trim(),
      comments: [],
    });

    setTitle("");
    setContent("");
    setPinned(false);
    loadPosts();
  }

  async function saveEdit(postId) {
    if (!editTitle.trim() || !editContent.trim())
      return alert("Naslov i sadržaj su obavezni.");

    await updateDoc(doc(db, "forumPosts", postId), {
      title: editTitle,
      content: editContent,
    });

    setEditingId(null);
    loadPosts();
  }

  async function togglePin(post) {
    await updateDoc(doc(db, "forumPosts", post.id), {
      pinned: !post.pinned,
    });
    loadPosts();
  }

  async function archivePost(post) {
    if (!window.confirm("Arhivirati ovu vest?")) return;
    await updateDoc(doc(db, "forumPosts", post.id), { archived: true });
    loadPosts();
  }

  // --- Comments (flat, optional) ---

  async function sendComment(post) {
    const text = commentText[post.id];
    if (!text || !text.trim()) return;

    const newComment = {
      id: Date.now().toString(),
      authorName: `${profile?.name || ""} ${profile?.surname || ""}`.trim(),
      content: text,
      createdAt: new Date(),
    };

    await updateDoc(doc(db, "forumPosts", post.id), {
      comments: [...(post.comments || []), newComment],
    });

    setCommentText((p) => ({ ...p, [post.id]: "" }));
    loadPosts();
  }

  if (loading) {
    return (
      <p className="text-center mt-10 text-gray-700 dark:text-gray-300">
        Učitavanje vesti...
      </p>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 flex justify-center bg-neutral-900">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-100 mb-6">
          Vesti
        </h2>

        {isAdmin && (
          <div className="bg-neutral-800 rounded-xl p-4 mb-6 space-y-3">
            <h3 className="font-semibold text-gray-100">Nova vest</h3>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Naslov"
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 text-gray-100 focus:outline-none"
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Sadržaj"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 text-gray-100 resize-none focus:outline-none"
            />

            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              Istaknuta vest
            </label>

            <button
              onClick={createPost}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Objavi
            </button>
          </div>
        )}

        {posts.length === 0 && (
          <p className="text-center text-gray-400">
            Trenutno nema objava.
          </p>
        )}

        {posts.map((post) => {
          if (!contentRefs.current[post.id]) {
            contentRefs.current[post.id] = { current: null };
          }

          const isOpen = expanded[post.id];
          const contentRef = contentRefs.current[post.id];

          return (
            <div
              key={post.id}
              className="bg-neutral-800 rounded-xl mb-4 overflow-hidden"
            >
              <div
                onClick={() =>
                  setExpanded((p) => ({ ...p, [post.id]: !p[post.id] }))
                }
                className="px-4 py-3 flex justify-between items-center cursor-pointer"
              >
                <h3
                  className={`font-semibold ${
                    post.pinned ? "text-blue-400" : "text-gray-100"
                  }`}
                >
                  {post.pinned && "• "} {post.title}
                </h3>
                <span className="text-gray-400 text-sm">
                  {isOpen ? "▲" : "▼"}
                </span>
              </div>

              <div
                ref={contentRef}
                className="px-4 overflow-hidden transition-all"
                style={{
                  maxHeight: isOpen
                    ? `${contentRef.current?.scrollHeight}px`
                    : 0,
                }}
              >
                <div className="pb-4 pt-2">
                  {editingId === post.id ? (
                    <>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 mb-2 rounded bg-neutral-700 text-gray-100"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 mb-2 rounded bg-neutral-700 text-gray-100 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(post.id)}
                          className="px-3 py-1 bg-blue-600 text-white rounded"
                        >
                          Sačuvaj
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 border border-gray-500 text-gray-300 rounded"
                        >
                          Otkaži
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-300 whitespace-pre-wrap mb-3">
                        {post.content}
                      </p>

                      {isAdmin && (
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => {
                              setEditingId(post.id);
                              setEditTitle(post.title);
                              setEditContent(post.content);
                            }}
                            className="px-2 py-1 bg-neutral-700 text-gray-200 rounded text-sm"
                          >
                            Izmeni
                          </button>
                          <button
                            onClick={() => togglePin(post)}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-sm"
                          >
                            {post.pinned ? "Ukloni pin" : "Pinuj"}
                          </button>
                          <button
                            onClick={() => archivePost(post)}
                            className="px-2 py-1 bg-red-600 text-white rounded text-sm"
                          >
                            Arhiviraj
                          </button>
                        </div>
                      )}

                      {COMMENTS_ENABLED && (
                        <div className="border-t border-neutral-700 pt-3">
                          {post.comments?.map((c) => (
                            <div key={c.id} className="mb-2">
                              <div className="text-xs text-gray-400">
                                {c.authorName}
                              </div>
                              <div className="text-sm text-gray-300">
                                {c.content}
                              </div>
                            </div>
                          ))}

                          <textarea
                            placeholder="Dodaj komentar..."
                            value={commentText[post.id] || ""}
                            onChange={(e) =>
                              setCommentText((p) => ({
                                ...p,
                                [post.id]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full px-3 py-2 mt-2 rounded bg-neutral-700 text-gray-100 resize-none"
                          />
                          <button
                            onClick={() => sendComment(post)}
                            className="mt-1 px-3 py-1 bg-blue-600 text-white rounded text-sm"
                          >
                            Pošalji
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
