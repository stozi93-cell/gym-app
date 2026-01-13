function Section({ title, isOpen, onToggle, children }) {
  return (
    <div style={{ border: "1px solid #333", borderRadius: 8, marginBottom: 12 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "12px 16px",
          background: "none",
          border: "none",
          color: "white",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {title}
      </button>

      {isOpen && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid #333" }}>
          {children}
        </div>
      )}
    </div>
  );
}
