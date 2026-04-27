import { ReactNode } from "react";

type AdminFormProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function AdminForm({ isOpen, onClose, children }: AdminFormProps) {
  return (
    <div
      className={`shrink-0 h-full bg-white shadow-xl transition-all duration-300 overflow-hidden ${
        isOpen ? "w-80" : "w-0"
      }`}
    >
      <div className="relative h-full overflow-y-auto p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-gray-500 hover:text-black text-lg font-bold"
        >
          x
        </button>

        {children}
      </div>
    </div>
  );
}