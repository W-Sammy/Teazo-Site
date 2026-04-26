import { ReactNode } from "react";

type AdminFormProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function AdminForm({ isOpen, onClose, children }: AdminFormProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center ">
      {/* background overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Form content*/}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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