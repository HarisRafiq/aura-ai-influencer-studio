import React from "react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: "ghost" | "primary" | "danger";
  size?: "sm" | "md" | "lg";
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = "ghost", size = "md", className = "", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

    const variantStyles = {
      ghost: "bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white",
      primary: "bg-indigo-500 hover:bg-indigo-600 text-white",
      danger: "bg-red-500 hover:bg-red-600 text-white",
    };

    const sizeStyles = {
      sm: "p-1.5",
      md: "p-2",
      lg: "p-3",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {icon}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";

export default IconButton;
