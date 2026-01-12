type LogoProps = {
  className?: string;
};

export function Logo({ className }: LogoProps) {
  return (
    <img
      src="/brand/logo-r.png"
      alt="ReMotion"
      className={className}
      draggable={false}
    />
  );
}
