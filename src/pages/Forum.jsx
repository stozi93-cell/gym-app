import { useEffect, useState } from "react";
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

const COMMENTS_ENABLED = true;

export default function Forum() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [posts, setPosts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  const [commentText, setCommentText] = useState({});

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    setLoading(true);
    const q = query(collection(db, "forumPosts"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    let data = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      comments: d.data().comments || [],
    }));

    data = data.filter((p) => !p.archived);
    data.sort((a, b) => (b.pinned === true) - (a.pinned === true));

    setPosts(data);
    setActiveId(data[0]?.id || null);
    setLoading(false);
  }

  async function createPost() {
    if (!title.trim() || !content.trim()) return;

    await addDoc(collection(db, "forumPosts"), {
      title,
      content,
      pinned,
      archived: false,
      createdAt: serverTimestamp(),
      authorName: `${profile?.name || ""} ${profile?.surname || ""}`.trim(),
      comments: [],
    });

    setTitle("");
    setContent("");
    setPinned(false);
    loadPosts();
  }

  async function sendComment(post) {
    const text = commentText[post.id];
    if (!text?.trim()) return;

    await updateDoc(doc(db, "forumPosts", post.id), {
      comments: [
        ...(post.comments || []),
        {
          id: Date.now().toString(),
          authorName: `${profile?.name || ""} ${profile?.surname || ""}`.trim(),
          content: text,
          createdAt: new Date(),
        },
      ],
    });

    setCommentText((p) => ({ ...p, [post.id]: "" }));
    loadPosts();
  }

  if (loading) {
    return (
      <p className="text-center mt-10 text-gray-400">Učitavanje…</p>
    );
  }

  const activePost = posts.find((p) => p.id === activeId);

  return (
    <div className="min-h-screen bg-neutral-900 px-4 py-4 flex justify-center">
      <div className="w-full max-w-md flex flex-col gap-3">

        {/* TITLE */}
        <h1 className="text-xl font-semibold text-gray-100 text-center">
          Vesti
        </h1>

        {/* ADMIN CREATE */}
        {isAdmin && (
          <div className="bg-neutral-800 rounded-xl p-3 space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Naslov"
              className="w-full px-3 py-2 rounded bg-neutral-700 text-gray-100"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Sadržaj"
              rows={2}
              className="w-full px-3 py-2 rounded bg-neutral-700 text-gray-100 resize-none"
            />
            <div className="flex items-center justify-between">
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
                className="px-4 py-1 bg-blue-600 text-white rounded"
              >
                Objavi
              </button>
            </div>
          </div>
        )}

        {/* LIST */}
        <div className="bg-neutral-800 rounded-xl divide-y divide-neutral-700">
          {posts.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={`w-full text-left px-3 py-3 flex justify-between items-center
                ${p.id === activeId ? "bg-neutral-700" : ""}`}
            >
              <span className={`text-sm font-medium ${p.pinned ? "text-blue-400" : "text-gray-100"}`}>
                {p.title}
              </span>
              {p.pinned && <span className="text-blue-400 text-xs">•</span>}
            </button>
          ))}
        </div>

        {/* CONTENT PANEL */}
        {activePost && (
          <div className="bg-neutral-800 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-gray-100">
              {activePost.title}
            </h2>

            <p className="text-gray-300 whitespace-pre-wrap text-sm">
              {activePost.content}
            </p>

            {COMMENTS_ENABLED && (
              <div className="border-t border-neutral-700 pt-3">
                <div className="max-h-28 overflow-y-auto space-y-2 mb-2">
                  {activePost.comments.map((c) => (
                    <div key={c.id} className="text-sm text-gray-300">
                      <span className="text-gray-400 block text-xs">
                        {c.authorName}
                      </span>
                      {c.content}
                    </div>
                  ))}
                </div>

                <textarea
                  rows={2}
                  placeholder="Dodaj komentar…"
                  value={commentText[activePost.id] || ""}
                  onChange={(e) =>
                    setCommentText((p) => ({
                      ...p,
                      [activePost.id]: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded bg-neutral-700 text-gray-100 resize-none"
                />
                <button
                  onClick={() => sendComment(activePost)}
                  className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm"
                >
                  Pošalji
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
