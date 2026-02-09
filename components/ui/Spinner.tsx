import React from "react";

type SpinnerSize = "sm" | "md" | "lg" | "xl";
type SpinnerVariant = "default" | "primary" | "white";

interface SpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  className?: string;
  label?: string;
}

const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "default",
  className = "",
  label,
}) => {
  const sizeStyles = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-2",
    xl: "w-12 h-12 border-3",
  };

  const variantStyles = {
    default: "border-indigo-400 border-t-transparent",
    primary: "border-purple-500 border-t-transparent",
    white: "border-white border-t-transparent",
  };

  if (label) {
    return (
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div
          className={`rounded-full animate-spin ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        />
        <p className="text-indigo-200 font-medium animate-pulse text-sm">
          {label}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-full animate-spin ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    />
  );
};

export default Spinner;
