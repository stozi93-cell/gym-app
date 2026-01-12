export default function StatusBanner({ type, message }) {
  if (!message) return null;

  const styles =
    type === "error"
      ? "bg-red-500/10 text-red-300"
      : "bg-green-500/10 text-green-300";

  return (
    <div className={`mb-6 rounded-xl px-4 py-3 text-sm ${styles}`}>
      {message}
    </div>
  );
}
