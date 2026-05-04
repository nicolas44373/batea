import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
  actions,
}: {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100",
        className
      )}
    >
      <div className="font-semibold text-gray-900 text-sm min-w-0 flex-1 truncate">{children}</div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
  trendValue,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
          {trendValue && (
            <span
              className={cn(
                "text-xs font-medium mt-1 inline-block",
                trend === "up" && "text-green-600",
                trend === "down" && "text-red-600",
                trend === "neutral" && "text-gray-500"
              )}
            >
              {trendValue}
            </span>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-brand-50 rounded-lg text-brand-600">{icon}</div>
        )}
      </div>
    </Card>
  );
}
