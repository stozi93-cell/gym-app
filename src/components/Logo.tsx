type LogoProps = {
  variant?: "full" | "icon";
  className?: string;
};

export function Logo({ variant = "icon", className }: LogoProps) {
  const src =
    variant === "full"
      ? "/assets/brand/full-logo.png"
      : "/assets/brand/icon.png";

  return (
    <img
      src={src}
      alt="ReMotion"
      className={className}
      draggable={false}
    />
  );
}
