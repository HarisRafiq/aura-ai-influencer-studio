import React from "react";

type CardVariant = "glass" | "glass-card" | "solid" | "elevated";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: React.ReactNode;
  hover?: boolean;
  clickable?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "glass-card",
      children,
      hover = false,
      clickable = false,
      className = "",
      ...props
    },
    ref,
  ) => {
    const baseStyles = "rounded-2xl transition-all";

    const variantStyles = {
      glass: "bg-white/5 backdrop-blur-md border border-white/10",
      "glass-card":
        "bg-gray-900/60 backdrop-blur-md border border-white/10 shadow-xl",
      solid: "bg-gray-900 border border-white/5",
      elevated:
        "bg-gradient-to-br from-gray-900 to-gray-800 border border-white/10 shadow-2xl shadow-purple-500/10",
    };

    const hoverStyles = hover
      ? "hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/10 hover:scale-[1.02]"
      : "";
    const clickableStyles = clickable ? "cursor-pointer" : "";

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${hoverStyles} ${clickableStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export default Card;
