import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  orderBy,
  query,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

export default function Forum() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // create
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  // edit
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // admin toggle to show archived
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadPosts();
  }, [showArchived]);

  async function loadPosts() {
    try {
      setLoading(true);
      const q = query(collection(db, "forumPosts"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      let data = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      data = data.filter(post => isAdmin ? (showArchived || !post.archived) : !post.archived);
      data.sort((a, b) => (b.pinned === true) - (a.pinned === true));

      setPosts(data);
    } catch (err) {
      console.error("Forum load error:", err);
      alert("Greška pri učitavanju foruma.");
    } finally {
      setLoading(false);
    }
  }

  async function createPost() {
    if (!title.trim() || !content.trim()) return alert("Naslov i sadržaj su obavezni.");

    await addDoc(collection(db, "forumPosts"), {
      title,
      content,
      pinned,
      archived: false,
      createdAt: serverTimestamp(),
      authorId: user.uid,
      authorName: `${profile?.name || ""} ${profile?.surname || ""}`.trim()
    });

    setTitle("");
    setContent("");
    setPinned(false);
    loadPosts();
  }

  async function saveEdit(postId) {
    if (!editTitle.trim() || !editContent.trim()) return alert("Naslov i sadržaj su obavezni.");

    await updateDoc(doc(db, "forumPosts", postId), { title: editTitle, content: editContent });
    setEditingId(null);
    loadPosts();
  }

  async function togglePin(post) {
    await updateDoc(doc(db, "forumPosts", post.id), { pinned: !post.pinned });
    loadPosts();
  }

  async function archivePost(post) {
    if (!window.confirm(post.archived ? "Vratiti ovu objavu?" : "Arhivirati ovu objavu?")) return;
    await updateDoc(doc(db, "forumPosts", post.id), { archived: !post.archived });
    loadPosts();
  }

  if (loading) return <p>Učitavanje objava...</p>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 10px" }}>
      <h2 style={{ textAlign: "center", marginBottom: 20 }}>📢 Forum</h2>

      {isAdmin && (
        <div style={{
          border: "1px solid #ddd",
          padding: 16,
          marginBottom: 24,
          borderRadius: 8,
          background: "#fefefe",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)"
        }}>
          <h3 style={{ marginTop: 0 }}>Nova objava</h3>

          <input
            type="text"
            placeholder="Naslov"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{
              width: "100%",
              marginBottom: 10,
              padding: 8,
              borderRadius: 6,
              border: "1px solid #ccc"
            }}
          />

          <textarea
            placeholder="Sadržaj objave"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              marginBottom: 10,
              padding: 8,
              borderRadius: 6,
              border: "1px solid #ccc",
              resize: "vertical"
            }}
          />

          <label style={{ display: "block", marginBottom: 10 }}>
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pinuj objavu
          </label>

          <button style={{
            padding: "8px 16px",
            borderRadius: 6,
            background: "#4caf50",
            color: "#fff",
            border: "none",
            cursor: "pointer"
          }} onClick={createPost}>Objavi</button>

          <label style={{ display: "block", marginTop: 12 }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Prikaži arhivirane objave
          </label>
        </div>
      )}

      {posts.length === 0 && <p style={{ textAlign: "center", color: "#666" }}>Nema objava.</p>}

      {posts.map(post => (
        <div key={post.id} style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          background: post.pinned ? "#fff8dc" : "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          opacity: post.archived ? 0.6 : 1
        }}>
          {editingId === post.id ? (
            <>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{ width: "100%", marginBottom: 10, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={4}
                style={{ width: "100%", marginBottom: 10, padding: 8, borderRadius: 6, border: "1px solid #ccc", resize: "vertical" }}
              />
              <button onClick={() => saveEdit(post.id)} style={{ marginRight: 8, padding: "6px 12px", borderRadius: 6, background: "#2196f3", color: "#fff", border: "none", cursor: "pointer" }}>💾 Sačuvaj</button>
              <button onClick={() => setEditingId(null)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}>❌ Otkaži</button>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>{post.pinned && "📌 "}{post.title}</h3>
              <p style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{post.content}</p>
              <small style={{ color: "#555" }}>Objavio: {post.authorName || "Admin"} • {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString("sr-RS") : ""}{post.archived ? " • (Arhivirano)" : ""}</small>

              {isAdmin && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => {
                    setEditingId(post.id);
                    setEditTitle(post.title);
                    setEditContent(post.content);
                  }} style={{ marginRight: 6, padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}>✏️ Izmeni</button>
                  <button onClick={() => togglePin(post)} style={{ marginRight: 6, padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}>{post.pinned ? "📍 Unpinuj" : "📌 Pinuj"}</button>
                  <button onClick={() => archivePost(post)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}>{post.archived ? "♻️ Vrati" : "🗑 Arhiviraj"}</button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
