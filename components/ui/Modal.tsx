import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  maxWidth = "sm",
}) => {
  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div
        className={`w-full min-h-screen sm:min-h-0 ${maxWidthStyles[maxWidth]} bg-gray-900/95 sm:bg-gray-900/60 backdrop-blur-md border-0 sm:border border-white/10 shadow-xl rounded-none sm:rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-6 relative animate-in fade-in zoom-in-95 duration-300`}
      >
        <button
          onClick={onClose}
          className="sticky top-2 sm:absolute sm:top-4 sm:right-4 ml-auto text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg z-10 flex"
        >
          <X className="w-5 h-5" />
        </button>

        {(title || icon || description) && (
          <div className="text-center pt-2 sm:pt-0">
            {icon && (
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3 text-indigo-400">
                {icon}
              </div>
            )}
            {title && <h3 className="text-lg sm:text-xl font-bold text-white">{title}</h3>}
            {description && (
              <p className="text-xs sm:text-sm text-gray-400 mt-1">{description}</p>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
};

export default Modal;
