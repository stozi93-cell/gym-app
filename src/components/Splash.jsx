export default function Splash() {
  return (
    <div
      className="
        fixed inset-0
        flex items-center justify-center
        bg-gradient-to-br
        from-brand-blue-900
        via-brand-blue-700
        to-brand-green-900
      "
    >
      <img
        src="/assets/brand/full-logo.png"
        alt="ReMotion"
        className="h-32 select-none"
        draggable={false}
      />
    </div>
  );
}
