import { useState } from "react";

/*Called in AdminRow.tsx*/
export function AdminActions({
  username,
  onDelete,
}: {
  username: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Actions for ${username}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-md px-2 py-1 text-lg leading-none text-gray-400 hover:bg-gray-50 hover:text-gray-600"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-28 overflow-visible rounded-md border border-gray-100 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}