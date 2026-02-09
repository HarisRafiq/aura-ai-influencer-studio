import React from "react";

type BadgeVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ghost";
type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon,
      children,
      className = "",
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center gap-1 font-medium rounded-full";

    const variantStyles = {
      primary: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
      secondary: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
      success: "bg-green-500/20 text-green-300 border border-green-500/30",
      warning: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
      danger: "bg-red-500/20 text-red-300 border border-red-500/30",
      info: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
      ghost: "bg-white/5 text-gray-400 border border-white/5",
    };

    const sizeStyles = {
      sm: "px-2 py-0.5 text-[10px]",
      md: "px-3 py-1 text-xs",
      lg: "px-4 py-1.5 text-sm",
    };

    return (
      <span
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {icon}
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";

export default Badge;
