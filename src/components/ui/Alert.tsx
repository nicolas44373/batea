import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "danger";

const variantClasses: Record<AlertVariant, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-green-50 border-green-200 text-green-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  danger: "bg-red-50 border-red-200 text-red-800",
};

const icons: Record<AlertVariant, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  danger: "✕",
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
  onClose,
}: AlertProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3 text-sm",
        variantClasses[variant],
        className
      )}
    >
      <span className="mt-0.5 shrink-0 font-bold">{icons[variant]}</span>
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity text-lg leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
}
