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

export default function Forum() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // create post
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  // edit post
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const [showArchived, setShowArchived] = useState(false);

  // comments state
  const [commentOpen, setCommentOpen] = useState({});
  const [commentText, setCommentText] = useState({});
  const [replyOpen, setReplyOpen] = useState({});
  const [replyText, setReplyText] = useState({});

  const [expandedPosts, setExpandedPosts] = useState({}); // click-to-expand

  // Refs for post content
  const contentRefs = useRef({});

  // --- Load posts ---
  useEffect(() => {
    loadPosts();
  }, [showArchived]);

  async function loadPosts() {
    try {
      setLoading(true);
      const q = query(collection(db, "forumPosts"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      let data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        comments: d.data().comments || [],
      }));

      data = data.filter((post) =>
        isAdmin ? showArchived || !post.archived : !post.archived
      );
      data.sort((a, b) => (b.pinned === true) - (a.pinned === true));

      setPosts(data);
    } catch (err) {
      console.error("Forum load error:", err);
      alert("Greška pri učitavanju foruma.");
    } finally {
      setLoading(false);
    }
  }

  // --- Post functions ---
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
    await updateDoc(doc(db, "forumPosts", post.id), { pinned: !post.pinned });
    loadPosts();
  }

  async function archivePost(post) {
    if (!window.confirm(post.archived ? "Vratiti ovu objavu?" : "Arhivirati ovu objavu?"))
      return;
    await updateDoc(doc(db, "forumPosts", post.id), { archived: !post.archived });
    loadPosts();
  }

  // --- Comments ---
  async function sendComment(postId, parentIds = []) {
    const text = parentIds.length === 0 ? commentText[postId] : replyText[parentIds.join("-")];
    if (!text || !text.trim()) return;

    const postRef = doc(db, "forumPosts", postId);
    const postData = posts.find((p) => p.id === postId);

    let comments = [...(postData.comments || [])];

    const newComment = {
      id: Date.now().toString(),
      authorId: user.uid,
      authorName: `${profile?.name || ""} ${profile?.surname || ""}`.trim(),
      content: text,
      createdAt: new Date(),
      replies: [],
    };

    if (parentIds.length === 0) {
      comments.push(newComment);
      setCommentText((prev) => ({ ...prev, [postId]: "" }));
    } else {
      let parent = comments;
      for (let i = 0; i < parentIds.length; i++) {
        parent = parent.find((c) => c.id === parentIds[i]).replies;
      }
      parent.push(newComment);
      setReplyText((prev) => ({ ...prev, [parentIds.join("-")]: "" }));
    }

    await updateDoc(postRef, { comments });
    loadPosts();
  }

  function renderComments(commentsArray, postId, parentIds = []) {
    if (!commentsArray) return null;
    return commentsArray.map((comment) => {
      const currentIds = [...parentIds, comment.id];
      const fieldId = currentIds.join("-");

      return (
        <div
          key={comment.id}
          className={`ml-${parentIds.length * 4} mt-3 border-l ${
            parentIds.length ? "border-gray-300 dark:border-gray-600 pl-2" : ""
          }`}
        >
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {comment.authorName} •{" "}
            <span className="text-gray-500 dark:text-gray-400 text-xs">
              {comment.createdAt?.toDate
                ? comment.createdAt.toDate().toLocaleString("sr-RS")
                : comment.createdAt?.toLocaleString?.()}
            </span>
          </div>
          <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {comment.content}
          </div>

          {replyOpen[fieldId] && (
            <div className="mt-2">
              <textarea
                value={replyText[fieldId] || ""}
                onChange={(e) =>
                  setReplyText((prev) => ({ ...prev, [fieldId]: e.target.value }))
                }
                className="w-full px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Odgovori..."
              />
              <button
                onClick={() => sendComment(postId, currentIds)}
                className="mt-1 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
              >
                Pošalji
              </button>
            </div>
          )}

          {renderComments(comment.replies, postId, currentIds)}
        </div>
      );
    });
  }

  if (loading)
    return (
      <p className="text-center mt-10 text-gray-700 dark:text-gray-300">
        Učitavanje objava...
      </p>
    );

  return (
    <div className="min-h-screen px-4 py-6 flex justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100 mb-6">
          📢 Forum
        </h2>

        {isAdmin && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-6 space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Nova objava</h3>
            <input
              type="text"
              placeholder="Naslov"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <textarea
              placeholder="Sadržaj objave"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              <span className="text-gray-700 dark:text-gray-300">Pinuj objavu</span>
            </label>
            <button
              onClick={createPost}
              className="w-full py-2 mt-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg"
            >
              Objavi
            </button>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span className="text-gray-700 dark:text-gray-300">Prikaži arhivirane objave</span>
            </label>
          </div>
        )}

        {posts.length === 0 && (
          <p className="text-center text-gray-600 dark:text-gray-400">Nema objava.</p>
        )}

        {posts.map((post) => {
          if (!contentRefs.current[post.id]) {
            contentRefs.current[post.id] = { current: null };
          }
          const contentRef = contentRefs.current[post.id];
          const isExpanded = expandedPosts[post.id];

          return (
            <div
              key={post.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow mb-4 overflow-hidden"
            >
              {/* Title */}
              <div
                onClick={() =>
                  setExpandedPosts((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                }
                className="px-4 py-3 flex justify-between items-center cursor-pointer select-none"
              >
                <h3
                  className={`font-semibold text-gray-900 dark:text-gray-100 ${
                    post.pinned ? "text-indigo-600" : ""
                  }`}
                >
                  {post.pinned && "📌 "} {post.title}
                </h3>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Collapsible Content */}
              <div
                ref={contentRef}
                className={`transition-all duration-300 ease-in-out px-4 overflow-hidden`}
                style={{
                  maxHeight: isExpanded ? `${contentRef.current?.scrollHeight}px` : 0,
                }}
              >
                <div className="pb-4 pt-2">
                  {editingId === post.id ? (
                    <>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 mb-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 mb-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(post.id)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                        >
                          💾 Sačuvaj
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 border rounded"
                        >
                          ❌ Otkaži
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-700 dark:text-gray-300 mb-2 whitespace-pre-wrap">
                        {post.content}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(post.id);
                                setEditTitle(post.title);
                                setEditContent(post.content);
                              }}
                              className="px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded text-sm"
                            >
                              ✏️ Izmeni
                            </button>
                            <button
                              onClick={() => togglePin(post)}
                              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm"
                            >
                              {post.pinned ? "📍 Unpinuj" : "📌 Pinuj"}
                            </button>
                            <button
                              onClick={() => archivePost(post)}
                              className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
                            >
                              {post.archived ? "♻️ Vrati" : "🗑 Arhiviraj"}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() =>
                            setCommentOpen((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                          }
                          className="px-2 py-1 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded text-sm"
                        >
                          💬 {post.comments?.length || 0}
                        </button>
                      </div>

                      {commentOpen[post.id] && (
                        <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-700">
                          <textarea
                            placeholder="Napiši komentar..."
                            value={commentText[post.id] || ""}
                            onChange={(e) =>
                              setCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 mb-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          />
                          <button
                            onClick={() => sendComment(post.id)}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm mb-2"
                          >
                            Pošalji
                          </button>

                          {renderComments(post.comments, post.id)}
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
