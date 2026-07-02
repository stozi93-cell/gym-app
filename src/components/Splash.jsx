export default function Splash() {
  return (
    <div
      className="
        fixed inset-0
        flex items-center justify-center
        bg-background-dark
      "
    >
      <img
        src="/assets/brand/full-logo.png"
        alt="ReMotion"
        className="h-28 w-72 select-none object-contain"
        draggable={false}
      />
    </div>
  );
}
