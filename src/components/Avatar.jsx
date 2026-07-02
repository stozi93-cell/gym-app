function getInitials(name = "") {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Avatar({
  name = "",
  photoURL = "",
  className = "h-10 w-10",
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-neutral-800 text-sm font-medium text-white shadow-inner ${className}`}
    >
      {photoURL ? (
        <img
          src={photoURL}
          alt={name ? `Fotografija: ${name}` : "Profilna fotografija"}
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
