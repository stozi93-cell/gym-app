import { useEffect, useState } from "react";
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

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    loadData();
  }, [showArchived]);

  async function loadData() {
    setLoading(true);

    const postsSnap = await getDocs(
      query(collection(db, "forumPosts"), orderBy("createdAt", "desc"))
    );

    let postData = postsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    if (!showArchived) {
      postData = postData.filter((p) => !p.archived);
    }

    postData.sort((a, b) => (b.pinned === true) - (a.pinned === true));
    setPosts(postData.slice(0, MAX_VISIBLE_POSTS));

    if (isAdmin) {
      const usersSnap = await getDocs(collection(db, "users"));
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

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
    });

    setTitle("");
    setContent("");
    setPinned(false);
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

  async function markRead(postId) {
    if (!user || profile?.readAnnouncements?.includes(postId)) return;

    await updateDoc(doc(db, "users", user.uid), {
      readAnnouncements: [
        ...(profile?.readAnnouncements || []),
        postId,
      ],
    });
  }

  function toggleExpand(postId) {
    const next = expandedId === postId ? null : postId;
    setExpandedId(next);
    if (next) markRead(postId);
  }

  function isUnread(post) {
    return !profile?.readAnnouncements?.includes(post.id);
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
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Tekst obaveštenja"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 text-gray-100 resize-none"
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
                {showArchived
                  ? "Sakrij arhivirana"
                  : "Prikaži arhivirana"}
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
                    unread
                      ? "border border-neutral-500"
                      : "opacity-70"
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(post.id)}
                    className="w-full px-4 py-3 flex justify-between text-left"
                  >
                    <span className="font-medium text-gray-100">
                      {post.pinned && "📌 "}
                      {post.title}
                    </span>
                    <div className="flex items-center gap-2">
                      {unread && (
                        <span className="w-2 h-2 bg-gray-300 rounded-full" />
                      )}
                      <span className="text-gray-400 text-sm">
                        {open ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {open && (
                    <div className="px-4 pb-4 text-sm text-gray-300 space-y-3">
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
                              onClick={() => togglePin(post)}
                              className="text-blue-400 underline"
                            >
                              {post.pinned
                                ? "Ukloni isticanje"
                                : "Istakni"}
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
